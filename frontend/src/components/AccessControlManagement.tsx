"use client";
import React, { useState, useEffect } from 'react';
import Card from './Card';
import { CardHeader, CardContent, CardTitle } from './CardComponents';
import Button from './Button';
import Input from './Input';
import Label from './Label';
import Badge from './Badge';
import Alert, { AlertDescription } from './Alert';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  AlertTriangle,
  Globe,
  Clock,
  User,
  Users,
  MapPin,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';
import { apiClient } from '../lib/api-client';

interface AccessRule {
  id: string;
  ruleType: string;
  status: string;
  name: string;
  description?: string;
  ipAddress: string;
  ipType: string;
  endIpAddress?: string;
  country?: string;
  region?: string;
  city?: string;
  allowedStartTime?: string;
  allowedEndTime?: string;
  allowedDays?: number[];
  userId?: string;
  allowedRoles?: string[];
  allowedProjects?: string[];
  hitCount: number;
  lastHitAt?: string;
  isEmergency: boolean;
  emergencyReason?: string;
  requiresApproval: boolean;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AccessControlManagementProps {
  onRuleCreated?: () => void;
  onRuleUpdated?: () => void;
  onRuleDeleted?: () => void;
}

export default function AccessControlManagement({
  onRuleDeleted
}: AccessControlManagementProps) {
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRule, setNewRule] = useState({
    name: '',
    description: '',
    ruleType: 'whitelist',
    ipAddress: '',
    ipType: 'single',
    priority: 500,
  });
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState({
    status: 'all',
    ruleType: 'all',
    search: '',
  });

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get<AccessRule[]>('/access-control/rules');
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };



  const deleteRule = async (ruleId: string) => {
    try {
      await apiClient.delete(`/access-control/rules/${ruleId}`);

      await fetchRules();
      onRuleDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const toggleRuleStatus = async (ruleId: string, isActive: boolean) => {
    const endpoint = isActive ? 'activate' : 'deactivate';
    try {
      await apiClient.post(`/access-control/rules/${ruleId}/${endpoint}`, {});

      await fetchRules();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${endpoint} rule`);
    }
  };

  const createRule = async () => {
    try {
      await apiClient.post('/access-control/rules', newRule);

      await fetchRules();
      setShowCreateForm(false);
      setNewRule({
        name: '',
        description: '',
        ruleType: 'whitelist',
        ipAddress: '',
        ipType: 'single',
        priority: 500,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  const getRuleTypeIcon = (ruleType: string) => {
    switch (ruleType) {
      case 'whitelist': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'blacklist': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'geographic': return <Globe className="h-4 w-4 text-blue-500" />;
      case 'time_based': return <Clock className="h-4 w-4 text-orange-500" />;
      case 'user_specific': return <User className="h-4 w-4 text-purple-500" />;
      case 'role_based': return <Users className="h-4 w-4 text-indigo-500" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (rule: AccessRule) => {
    if (rule.isEmergency) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Emergency</Badge>;
    }
    if (rule.requiresApproval) {
      return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
    if (rule.isActive) {
      return <Badge variant="default" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />Active</Badge>;
    }
    return <Badge variant="outline" className="flex items-center gap-1"><Pause className="h-3 w-3" />Inactive</Badge>;
  };

  const filteredRules = rules.filter(rule => {
    if (filter.status !== 'all' && rule.status !== filter.status) return false;
    if (filter.ruleType !== 'all' && rule.ruleType !== filter.ruleType) return false;
    if (filter.search && !rule.name.toLowerCase().includes(filter.search.toLowerCase()) &&
      !rule.ipAddress.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading access rules...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Access Control Rules</h2>
        <Button onClick={() => setShowCreateForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Rule
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="status-filter">Status</Label>
              <select
                id="status-filter"
                className="w-full px-3 py-2 border border-neutral-300 rounded-md dark:bg-neutral-800 dark:border-neutral-600 dark:text-white"
                value={filter.status}
                onChange={(e) => setFilter(prev => ({ ...prev, status: e.target.value }))}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="expired">Expired</option>
              </select>
            </div>
            <div>
              <Label htmlFor="type-filter">Rule Type</Label>
              <select
                id="type-filter"
                className="w-full px-3 py-2 border border-neutral-300 rounded-md dark:bg-neutral-800 dark:border-neutral-600 dark:text-white"
                value={filter.ruleType}
                onChange={(e) => setFilter(prev => ({ ...prev, ruleType: e.target.value }))}
              >
                <option value="all">All Types</option>
                <option value="whitelist">Whitelist</option>
                <option value="blacklist">Blacklist</option>
                <option value="geographic">Geographic</option>
                <option value="time_based">Time-based</option>
                <option value="user_specific">User-specific</option>
                <option value="role_based">Role-based</option>
              </select>
            </div>
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search rules..."
                value={filter.search}
                onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={fetchRules}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rules List */}
      <div className="grid gap-4">
        {filteredRules.map((rule) => (
          <Card key={rule.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getRuleTypeIcon(rule.ruleType)}
                  <div>
                    <CardTitle className="text-lg">{rule.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {rule.description || 'No description'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadge(rule)}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowDetails(prev => ({
                      ...prev,
                      [rule.id]: !prev[rule.id]
                    }))}
                  >
                    {showDetails[rule.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">IP Address</p>
                  <p className="font-mono text-xs">{rule.ipAddress}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Type</p>
                  <p className="capitalize">{rule.ipType}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Hits</p>
                  <p>{rule.hitCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Priority</p>
                  <p>{rule.priority}</p>
                </div>
              </div>

              {showDetails[rule.id] && (
                <div className="mt-4 pt-4 border-t space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-muted-foreground">Rule ID</p>
                      <p className="font-mono text-xs break-all">{rule.id}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Created</p>
                      <p>{new Date(rule.createdAt).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Last Hit</p>
                      <p>{rule.lastHitAt ? new Date(rule.lastHitAt).toLocaleString() : 'Never'}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">Status</p>
                      <p className="capitalize">{rule.status}</p>
                    </div>
                  </div>

                  {rule.country && (
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        <span>{rule.city && rule.region ? `${rule.city}, ${rule.region}` : rule.country}</span>
                      </div>
                    </div>
                  )}

                  {rule.isEmergency && rule.emergencyReason && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Emergency Access:</strong> {rule.emergencyReason}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => toggleRuleStatus(rule.id, !rule.isActive)}
                    >
                      {rule.isActive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                      {rule.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {/* Edit functionality */ }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRules.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Access Rules</h3>
            <p className="text-muted-foreground">
              Create your first access control rule to get started.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Create Rule Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Create Access Control Rule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="rule-name">Rule Name</Label>
                <Input
                  id="rule-name"
                  value={newRule.name}
                  onChange={(e) => setNewRule(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Office IP Whitelist"
                />
              </div>

              <div>
                <Label htmlFor="rule-description">Description</Label>
                <Input
                  id="rule-description"
                  value={newRule.description}
                  onChange={(e) => setNewRule(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="rule-type">Rule Type</Label>
                  <select
                    id="rule-type"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md dark:bg-neutral-800 dark:border-neutral-600 dark:text-white"
                    value={newRule.ruleType}
                    onChange={(e) => setNewRule(prev => ({ ...prev, ruleType: e.target.value }))}
                  >
                    <option value="whitelist">Whitelist</option>
                    <option value="blacklist">Blacklist</option>
                    <option value="geographic">Geographic</option>
                    <option value="time_based">Time-based</option>
                    <option value="user_specific">User-specific</option>
                    <option value="role_based">Role-based</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="ip-type">IP Type</Label>
                  <select
                    id="ip-type"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-md dark:bg-neutral-800 dark:border-neutral-600 dark:text-white"
                    value={newRule.ipType}
                    onChange={(e) => setNewRule(prev => ({ ...prev, ipType: e.target.value }))}
                  >
                    <option value="single">Single IP</option>
                    <option value="range">IP Range</option>
                    <option value="cidr">CIDR</option>
                    <option value="wildcard">Wildcard</option>
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="ip-address">IP Address</Label>
                <Input
                  id="ip-address"
                  value={newRule.ipAddress}
                  onChange={(e) => setNewRule(prev => ({ ...prev, ipAddress: e.target.value }))}
                  placeholder="e.g., 192.168.1.1 or 192.168.1.0/24"
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority (1-1000)</Label>
                <Input
                  id="priority"
                  type="number"
                  min="1"
                  max="1000"
                  value={newRule.priority}
                  onChange={(e) => setNewRule(prev => ({ ...prev, priority: parseInt(e.target.value) || 500 }))}
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewRule({
                      name: '',
                      description: '',
                      ruleType: 'whitelist',
                      ipAddress: '',
                      ipType: 'single',
                      priority: 500,
                    });
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={createRule}
                  disabled={!newRule.name || !newRule.ipAddress}
                >
                  Create Rule
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
