import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Integration, IntegrationType } from '../entities/integration.entity';

/**
 * Response from GitHub's installation token endpoint.
 */
interface InstallationTokenResponse {
    token: string;
    expires_at: string;
    permissions: Record<string, string>;
    repository_selection: string;
}

/**
 * Cached installation token with expiration.
 */
interface CachedToken {
    token: string;
    expiresAt: Date;
}

/**
 * GitHub App Installation event payload.
 */
export interface GitHubInstallationPayload {
    action: 'created' | 'deleted' | 'suspend' | 'unsuspend' | 'new_permissions_accepted';
    installation: {
        id: number;
        account: {
            login: string;
            id: number;
            type: 'User' | 'Organization';
        };
        repository_selection: 'all' | 'selected';
        permissions: Record<string, string>;
        events: string[];
    };
    repositories?: Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
    }>;
    sender: {
        login: string;
        id: number;
    };
}

/**
 * GitHub App Installation Repositories event payload.
 */
export interface GitHubInstallationRepositoriesPayload {
    action: 'added' | 'removed';
    installation: {
        id: number;
        account: {
            login: string;
            type: 'User' | 'Organization';
        };
    };
    repository_selection: 'all' | 'selected';
    repositories_added: Array<{
        id: number;
        name: string;
        full_name: string;
        private: boolean;
    }>;
    repositories_removed: Array<{
        id: number;
        name: string;
        full_name: string;
    }>;
    sender: {
        login: string;
    };
}

/**
 * Service for GitHub App authentication and token management.
 * 
 * GitHub App authentication flow:
 * 1. Generate a JWT signed with the App's private key (valid 10 min)
 * 2. Use JWT to request an Installation Access Token (valid 1 hour)
 * 3. Use Installation Token for API calls
 * 
 * This provides organization-level access that survives employee turnover,
 * unlike OAuth App tokens which are tied to individual users.
 */
@Injectable()
export class GitHubAppService {
    private readonly logger = new Logger(GitHubAppService.name);
    private readonly githubApiBase = 'https://api.github.com';

    // Cache for installation tokens (key: installationId, value: token + expiry)
    private tokenCache = new Map<string, CachedToken>();

    // Token refresh buffer (refresh 5 minutes before expiry)
    private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

    constructor(
        private configService: ConfigService,
        @InjectRepository(Integration)
        private integrationRepo: Repository<Integration>,
    ) { }

    /**
     * Check if GitHub App is configured with required env vars.
     */
    isConfigured(): boolean {
        const appId = this.configService.get<string>('GITHUB_APP_ID');
        const privateKey = this.configService.get<string>('GITHUB_APP_PRIVATE_KEY');
        return !!(appId && privateKey);
    }

    /**
     * Get the GitHub App ID.
     */
    getAppId(): string {
        const appId = this.configService.get<string>('GITHUB_APP_ID');
        if (!appId) {
            throw new Error('GITHUB_APP_ID is not configured');
        }
        return appId;
    }

    /**
     * Get the GitHub App private key (PEM format).
     */
    private getPrivateKey(): string {
        const privateKey = this.configService.get<string>('GITHUB_APP_PRIVATE_KEY');
        if (!privateKey) {
            throw new Error('GITHUB_APP_PRIVATE_KEY is not configured');
        }
        // Handle escaped newlines from env var
        return privateKey.replace(/\\n/g, '\n');
    }

    /**
     * Get the GitHub App webhook secret for signature verification.
     */
    getWebhookSecret(): string | undefined {
        return this.configService.get<string>('GITHUB_APP_WEBHOOK_SECRET');
    }

    /**
     * Generate a JWT for GitHub App authentication.
     * 
     * The JWT is signed with the app's private key (RS256 algorithm)
     * and is valid for 10 minutes (GitHub's limit).
     * 
     * @returns Signed JWT string
     */
    generateAppJWT(): string {
        const appId = this.getAppId();
        const privateKey = this.getPrivateKey();

        const now = Math.floor(Date.now() / 1000);
        // GitHub allows max 10 minutes, use 5 minutes to be safe with clock drift
        const expiry = now + 300; // 5 minutes

        // JWT Header
        const header = {
            alg: 'RS256',
            typ: 'JWT',
        };

        // JWT Payload - use shorter window to avoid clock drift issues
        const payload = {
            iat: now - 30, // Issued 30 seconds in the past to account for clock drift
            exp: expiry,
            iss: appId, // GitHub App ID
        };

        // Encode header and payload
        const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
        const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));

        // Create signature
        const signatureInput = `${encodedHeader}.${encodedPayload}`;
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(signatureInput);
        sign.end();

        // Use crypto.createPrivateKey to properly parse the key for OpenSSL 3.x compatibility
        // This handles both PKCS#1 (RSA PRIVATE KEY) and PKCS#8 (PRIVATE KEY) formats
        let keyObject: crypto.KeyObject;
        try {
            keyObject = crypto.createPrivateKey({
                key: privateKey,
                format: 'pem',
            });
        } catch (keyError) {
            this.logger.error('Failed to parse private key. Make sure GITHUB_APP_PRIVATE_KEY is a valid PEM-formatted RSA private key.');
            this.logger.error('Key should start with -----BEGIN RSA PRIVATE KEY----- or -----BEGIN PRIVATE KEY-----');
            throw keyError;
        }

        const signature = sign.sign(keyObject);
        const encodedSignature = this.base64UrlEncode(signature);

        return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
    }

    /**
     * Base64 URL encode for JWT.
     */
    private base64UrlEncode(input: string | Buffer): string {
        const base64 = Buffer.isBuffer(input)
            ? input.toString('base64')
            : Buffer.from(input).toString('base64');

        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }

    /**
     * Get an Installation Access Token for a specific installation.
     * 
     * This token is used for API calls scoped to the installation.
     * Tokens are cached and automatically refreshed before expiry.
     * 
     * @param installationId - GitHub App installation ID
     * @returns Installation access token
     */
    async getInstallationToken(installationId: string): Promise<string> {
        // Check cache first
        const cached = this.tokenCache.get(installationId);
        if (cached && cached.expiresAt.getTime() > Date.now() + this.TOKEN_REFRESH_BUFFER_MS) {
            return cached.token;
        }

        this.logger.debug(`Fetching new installation token for ${installationId}`);

        // Generate JWT
        const jwt = this.generateAppJWT();

        // Request installation token
        const response = await fetch(
            `${this.githubApiBase}/app/installations/${installationId}/access_tokens`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${jwt}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            },
        );

        if (!response.ok) {
            const errorText = await response.text();
            this.logger.error(
                `Failed to get installation token: ${response.status} - ${errorText}`,
            );
            throw new Error(
                `Failed to get GitHub installation token: ${response.status}`,
            );
        }

        const data: InstallationTokenResponse = await response.json();

        // Cache the token
        const expiresAt = new Date(data.expires_at);
        this.tokenCache.set(installationId, {
            token: data.token,
            expiresAt,
        });

        this.logger.debug(
            `Got new installation token for ${installationId}, expires at ${expiresAt.toISOString()}`,
        );

        return data.token;
    }

    /**
     * Execute a function with an installation access token.
     * 
     * Handles token caching and automatic refresh.
     * Use this to wrap all GitHub API calls.
     * 
     * @param installationId - GitHub App installation ID
     * @param fn - Function to execute with the token
     * @returns Result of the function
     */
    async executeWithInstallationToken<T>(
        installationId: string,
        fn: (token: string) => Promise<T>,
    ): Promise<T> {
        const token = await this.getInstallationToken(installationId);
        return fn(token);
    }

    /**
     * Delete a GitHub App installation.
     * 
     * This fully uninstalls the app from the user/organization's GitHub account.
     * Uses the App JWT (not installation token) for authentication.
     * 
     * @param installationId - GitHub App installation ID to delete
     */
    async deleteInstallation(installationId: string): Promise<void> {
        const jwt = this.generateAppJWT();

        this.logger.log(`Deleting GitHub App installation ${installationId}`);

        const response = await fetch(
            `https://api.github.com/app/installations/${installationId}`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${jwt}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            },
        );

        if (!response.ok && response.status !== 404) {
            const errorText = await response.text();
            this.logger.error(
                `Failed to delete installation ${installationId}: ${response.status} - ${errorText}`,
            );
            throw new Error(`Failed to delete GitHub installation: ${response.status}`);
        }

        // Clear token cache for this installation
        this.tokenCache.delete(installationId);

        this.logger.log(`GitHub App installation ${installationId} deleted successfully`);
    }

    /**
     * Verify GitHub webhook signature.
     * 
     * @param payload - Raw request body
     * @param signature - x-hub-signature-256 header value
     * @returns true if signature is valid
     */
    verifyWebhookSignature(payload: Buffer, signature: string): boolean {
        const secret = this.getWebhookSecret();
        if (!secret) {
            this.logger.warn('GitHub App webhook secret not configured');
            return false;
        }

        const expectedSignature = `sha256=${crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex')}`;

        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature),
        );
    }

    /**
     * Handle GitHub App installation event.
     * 
     * Creates or updates Integration record based on installation status.
     */
    async handleInstallationEvent(
        payload: GitHubInstallationPayload,
        organizationId: string,
    ): Promise<Integration | null> {
        const { action, installation } = payload;
        const installationId = installation.id.toString();

        this.logger.log(
            `Handling GitHub App installation event: ${action} for ${installation.account.login} (${installationId})`,
        );

        switch (action) {
            case 'created': {
                // Check if integration already exists
                let integration = await this.integrationRepo.findOne({
                    where: {
                        organizationId,
                        type: IntegrationType.GITHUB,
                        installationId,
                    },
                });

                if (!integration) {
                    // Create new integration
                    integration = this.integrationRepo.create({
                        name: `GitHub (${installation.account.login})`,
                        type: IntegrationType.GITHUB,
                        organizationId,
                        installationId,
                        accountType: installation.account.type,
                        accountLogin: installation.account.login,
                        isLegacyOAuth: false,
                        isActive: true,
                        config: {
                            repositories: payload.repositories?.map((r) => r.full_name) || [],
                            syncSettings: {
                                enabled: true,
                                frequency: 'realtime',
                                batchSize: 100,
                            },
                            notifications: {
                                enabled: true,
                                channels: [],
                                events: ['push', 'pull_request', 'issues'],
                            },
                        },
                        authConfig: {
                            type: 'oauth', // Using 'oauth' as the type, but tokens are managed differently
                            scopes: Object.keys(installation.permissions),
                        },
                    });
                } else {
                    // Update existing integration
                    integration.accountType = installation.account.type;
                    integration.accountLogin = installation.account.login;
                    integration.isActive = true;
                    integration.config.repositories =
                        payload.repositories?.map((r) => r.full_name) || [];
                }

                await this.integrationRepo.save(integration);
                this.logger.log(`Created/updated GitHub integration ${integration.id}`);
                return integration;
            }

            case 'deleted': {
                const integration = await this.integrationRepo.findOne({
                    where: { installationId },
                });

                if (integration) {
                    integration.isActive = false;
                    await this.integrationRepo.save(integration);
                    this.logger.log(`Deactivated GitHub integration ${integration.id}`);
                    return integration;
                }
                break;
            }

            case 'suspend': {
                const integration = await this.integrationRepo.findOne({
                    where: { installationId },
                });

                if (integration) {
                    integration.isActive = false;
                    await this.integrationRepo.save(integration);
                    this.logger.log(`Suspended GitHub integration ${integration.id}`);
                    return integration;
                }
                break;
            }

            case 'unsuspend': {
                const integration = await this.integrationRepo.findOne({
                    where: { installationId },
                });

                if (integration) {
                    integration.isActive = true;
                    await this.integrationRepo.save(integration);
                    this.logger.log(`Unsuspended GitHub integration ${integration.id}`);
                    return integration;
                }
                break;
            }
        }

        return null;
    }

    /**
     * Handle GitHub App installation_repositories event.
     * 
     * Updates the repository list when repos are added/removed from installation.
     */
    async handleInstallationRepositoriesEvent(
        payload: GitHubInstallationRepositoriesPayload,
    ): Promise<void> {
        const installationId = payload.installation.id.toString();

        this.logger.log(
            `Handling installation_repositories event: ${payload.action} for installation ${installationId}`,
        );

        const integration = await this.integrationRepo.findOne({
            where: { installationId },
        });

        if (!integration) {
            this.logger.warn(
                `No integration found for installation ${installationId}`,
            );
            return;
        }

        const currentRepos = integration.config.repositories || [];

        if (payload.action === 'added') {
            // Add new repositories
            const newRepos = payload.repositories_added.map((r) => r.full_name);
            integration.config.repositories = [...new Set([...currentRepos, ...newRepos])];
            this.logger.log(`Added ${newRepos.length} repos to integration ${integration.id}`);
        } else if (payload.action === 'removed') {
            // Remove repositories
            const removedRepos = new Set(
                payload.repositories_removed.map((r) => r.full_name),
            );
            integration.config.repositories = currentRepos.filter(
                (r) => !removedRepos.has(r),
            );
            this.logger.log(
                `Removed ${removedRepos.size} repos from integration ${integration.id}`,
            );
        }

        await this.integrationRepo.save(integration);
    }

    /**
     * List all accessible repositories for an installation.
     */
    async listInstallationRepositories(
        installationId: string,
    ): Promise<Array<{ full_name: string; name: string; private: boolean }>> {
        return this.executeWithInstallationToken(installationId, async (token) => {
            const repos: Array<{ full_name: string; name: string; private: boolean }> = [];
            let page = 1;
            const perPage = 100;

            while (true) {
                const response = await fetch(
                    `${this.githubApiBase}/installation/repositories?per_page=${perPage}&page=${page}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            Accept: 'application/vnd.github+json',
                            'X-GitHub-Api-Version': '2022-11-28',
                        },
                    },
                );

                if (!response.ok) {
                    throw new Error(`Failed to list repositories: ${response.status}`);
                }

                const data = await response.json();
                const pageRepos = data.repositories || [];

                repos.push(
                    ...pageRepos.map((r: { full_name: string; name: string; private: boolean }) => ({
                        full_name: r.full_name,
                        name: r.name,
                        private: r.private,
                    })),
                );

                if (pageRepos.length < perPage) {
                    break;
                }

                page++;
                if (page > 10) {
                    this.logger.warn('Reached pagination limit');
                    break;
                }
            }

            return repos;
        });
    }

    /**
     * Get GitHub App installation URL for user to install the app.
     */
    getInstallationUrl(state?: string): string {
        const appSlug = this.configService.get<string>('GITHUB_APP_SLUG') || 'zenith-pm';
        const baseUrl = `https://github.com/apps/${appSlug}/installations/new`;

        if (state) {
            return `${baseUrl}?state=${encodeURIComponent(state)}`;
        }

        return baseUrl;
    }
}
