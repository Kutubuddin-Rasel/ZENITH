import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// EMAIL TEMPLATE SERVICE
//
// Compiles and caches Handlebars templates with layout/partial support.
//
// ARCHITECTURE:
// - Templates are loaded from disk ONCE at startup (OnModuleInit)
// - Compiled templates are cached in Map for O(1) lookup
// - Partials (button, etc.) are globally registered with Handlebars
// - Layout wraps content via {{{content}}} triple-stache (raw, pre-rendered)
//
// SECURITY:
// Handlebars auto-escapes {{double-stache}} variables by default.
// This replaces the manual escapeHtml() from Phase 1.
// URLs that have been domain-validated use {{{triple-stache}}} in templates.
// ============================================================================

/** Base directory for email templates (relative to compiled dist/output) */
const TEMPLATES_DIR = join(__dirname, 'templates');

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);

  /** Cached compiled content templates (e.g., 'invitation' → compiled fn) */
  private readonly templates = new Map<string, Handlebars.TemplateDelegate>();

  /** Compiled layout template */
  private layoutTemplate: Handlebars.TemplateDelegate | null = null;

  onModuleInit(): void {
    this.loadPartials();
    this.loadLayout();
    this.loadTemplates();

    this.logger.log(
      `Email templates loaded: ${[...this.templates.keys()].join(', ')}`,
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Renders a complete email HTML by compiling the content template
   * and wrapping it in the base layout.
   *
   * @param templateName - Name of the content template (e.g., 'invitation')
   * @param context - Template variables (auto-escaped by Handlebars)
   * @returns Complete HTML string ready for sending
   *
   * @example
   * render('invitation', { inviterName: 'Alice', orgName: 'Acme', inviteLink: '...' })
   */
  render(templateName: string, context: Record<string, unknown>): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(
        `Email template "${templateName}" not found. Available: ${[...this.templates.keys()].join(', ')}`,
      );
    }

    // Step 1: Render the content template (auto-escaped variables)
    const content = template(context);

    // Step 2: Wrap in layout (content is raw HTML, hence {{{content}}} in layout)
    if (this.layoutTemplate) {
      return this.layoutTemplate({
        title: (context['title'] as string) || 'Zenith',
        year: new Date().getFullYear(),
        content,
      });
    }

    // Fallback: return raw content if no layout loaded
    return content;
  }

  /**
   * Returns the list of available template names.
   */
  getAvailableTemplates(): string[] {
    return [...this.templates.keys()];
  }

  // ==========================================================================
  // TEMPLATE LOADING (runs once at startup)
  // ==========================================================================

  private loadPartials(): void {
    const partialsDir = join(TEMPLATES_DIR, 'partials');
    try {
      const files = readdirSync(partialsDir);
      for (const file of files) {
        if (!file.endsWith('.hbs')) continue;
        const name = file.replace('.hbs', '');
        const source = readFileSync(join(partialsDir, file), 'utf-8');
        Handlebars.registerPartial(name, source);
        this.logger.debug(`Registered partial: ${name}`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not load partials from ${partialsDir}: ${(error as Error).message}`,
      );
    }
  }

  private loadLayout(): void {
    const layoutPath = join(TEMPLATES_DIR, 'layouts', 'base.hbs');
    try {
      const source = readFileSync(layoutPath, 'utf-8');
      this.layoutTemplate = Handlebars.compile(source);
      this.logger.debug('Loaded base layout template');
    } catch (error) {
      this.logger.warn(
        `Could not load layout from ${layoutPath}: ${(error as Error).message}`,
      );
    }
  }

  private loadTemplates(): void {
    try {
      const files = readdirSync(TEMPLATES_DIR);
      for (const file of files) {
        if (!file.endsWith('.hbs')) continue;
        const name = file.replace('.hbs', '');
        const source = readFileSync(join(TEMPLATES_DIR, file), 'utf-8');
        this.templates.set(name, Handlebars.compile(source));
        this.logger.debug(`Loaded template: ${name}`);
      }
    } catch (error) {
      this.logger.warn(
        `Could not load templates from ${TEMPLATES_DIR}: ${(error as Error).message}`,
      );
    }
  }
}
