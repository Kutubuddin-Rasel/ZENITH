'use client';

import React, { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, Target, DollarSign, Users, Brain, BarChart3 } from 'lucide-react';

interface BurnoutRisk {
  userId: string;
  userName: string;
  riskScore: number;
  factors: Array<{
    factor: string;
    impact: number;
    description: string;
  }>;
  recommendations: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

interface ResourceInsights {
  organizationId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  utilization: {
    average: number;
    trend: 'increasing' | 'decreasing' | 'stable';
    distribution: Record<string, number>;
  };
  skills: {
    mostInDemand: string[];
    skillGaps: string[];
    emergingSkills: string[];
  };
  costs: {
    totalSpent: number;
    averageHourlyRate: number;
    costTrend: 'increasing' | 'decreasing' | 'stable';
  };
  recommendations: string[];
}

interface ResourceAnalyticsProps {
  className?: string;
}

export default function ResourceAnalytics({ className = '' }: ResourceAnalyticsProps) {
  const [burnoutRisk, setBurnoutRisk] = useState<BurnoutRisk | null>(null);
  const [insights, setInsights] = useState<ResourceInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('30d');

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedPeriod]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      
      const [burnoutResponse, insightsResponse] = await Promise.all([
        fetch('/api/resource-analytics/burnout-risk/current-user', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        }),
        fetch('/api/resource-analytics/insights/default', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
          },
        }),
      ]);

      if (burnoutResponse.ok) {
        const burnoutData = await burnoutResponse.json();
        setBurnoutRisk(burnoutData.data);
      }

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        setInsights(insightsData.data);
      }
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-600 bg-red-100';
    if (score >= 60) return 'text-orange-600 bg-orange-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-100 border-green-200';
      default: return 'text-neutral-600 bg-neutral-100 border-neutral-200';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing': return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'decreasing': return <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />;
      default: return <BarChart3 className="h-4 w-4 text-neutral-500" />;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-neutral-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow">
                <div className="h-4 bg-neutral-200 rounded w-1/2 mb-2"></div>
                <div className="h-8 bg-neutral-200 rounded w-3/4"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Resource Analytics</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Predictive analytics and insights for resource optimization
          </p>
        </div>
        
        <div className="mt-4 sm:mt-0">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-neutral-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-neutral-500">Avg Utilization</p>
              <p className="text-2xl font-semibold text-neutral-900">
                {insights?.utilization.average.toFixed(1) || 0}%
              </p>
              <div className="flex items-center mt-1">
                {getTrendIcon(insights?.utilization.trend || 'stable')}
                <span className="ml-1 text-sm text-neutral-500 capitalize">
                  {insights?.utilization.trend || 'stable'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-neutral-500">Total Spent</p>
              <p className="text-2xl font-semibold text-neutral-900">
                {formatCurrency(insights?.costs.totalSpent || 0)}
              </p>
              <div className="flex items-center mt-1">
                {getTrendIcon(insights?.costs.costTrend || 'stable')}
                <span className="ml-1 text-sm text-neutral-500 capitalize">
                  {insights?.costs.costTrend || 'stable'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Users className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-neutral-500">Skill Gaps</p>
              <p className="text-2xl font-semibold text-neutral-900">
                {insights?.skills.skillGaps.length || 0}
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                {insights?.skills.emergingSkills.length || 0} emerging skills
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-neutral-500">Burnout Risk</p>
              <p className="text-2xl font-semibold text-neutral-900">
                {burnoutRisk?.riskScore || 0}%
              </p>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${getUrgencyColor(burnoutRisk?.urgency || 'low')}`}
              >
                {burnoutRisk?.urgency?.toUpperCase() || 'LOW'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Burnout Risk Analysis */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h3 className="text-lg font-medium text-neutral-900">Burnout Risk Analysis</h3>
            <p className="mt-1 text-sm text-neutral-500">
              AI-powered assessment of team member burnout risk
            </p>
          </div>
          
          <div className="p-6">
            {burnoutRisk ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-700">Risk Score</span>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(burnoutRisk.riskScore)}`}
                  >
                    {burnoutRisk.riskScore}%
                  </span>
                </div>
                
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      burnoutRisk.riskScore >= 80 ? 'bg-red-500' :
                      burnoutRisk.riskScore >= 60 ? 'bg-orange-500' :
                      burnoutRisk.riskScore >= 40 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${burnoutRisk.riskScore}%` }}
                  ></div>
                </div>
                
                {burnoutRisk.factors.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">Risk Factors</h4>
                    <div className="space-y-2">
                      {burnoutRisk.factors.map((factor, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-neutral-600">{factor.description}</span>
                          <span className="text-neutral-900 font-medium">{factor.impact}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {burnoutRisk.recommendations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-neutral-700 mb-2">Recommendations</h4>
                    <ul className="space-y-1">
                      {burnoutRisk.recommendations.map((recommendation, index) => (
                        <li key={index} className="text-sm text-neutral-600 flex items-start">
                          <span className="mr-2">•</span>
                          <span>{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Brain className="mx-auto h-12 w-12 text-neutral-400" />
                <h3 className="mt-2 text-sm font-medium text-neutral-900">No risk data</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Burnout risk analysis not available
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Skill Analysis */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h3 className="text-lg font-medium text-neutral-900">Skill Analysis</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Current skill landscape and gaps
            </p>
          </div>
          
          <div className="p-6">
            {insights?.skills ? (
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-neutral-700 mb-3">Most In-Demand Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {insights.skills.mostInDemand.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-neutral-700 mb-3">Skill Gaps</h4>
                  {insights.skills.skillGaps.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {insights.skills.skillGaps.map((skill, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-neutral-500">No significant skill gaps identified</p>
                  )}
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-neutral-700 mb-3">Emerging Skills</h4>
                  <div className="flex flex-wrap gap-2">
                    {insights.skills.emergingSkills.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Target className="mx-auto h-12 w-12 text-neutral-400" />
                <h3 className="mt-2 text-sm font-medium text-neutral-900">No skill data</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Skill analysis not available
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Utilization Distribution */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-neutral-200">
          <h3 className="text-lg font-medium text-neutral-900">Utilization Distribution</h3>
          <p className="mt-1 text-sm text-neutral-500">
            How team members are distributed across utilization ranges
          </p>
        </div>
        
        <div className="p-6">
          {insights?.utilization.distribution ? (
            <div className="space-y-4">
              {Object.entries(insights.utilization.distribution).map(([range, count]) => (
                <div key={range} className="flex items-center">
                  <div className="w-20 text-sm text-neutral-600">{range}</div>
                  <div className="flex-1 mx-4">
                    <div className="w-full bg-neutral-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(count / Math.max(...Object.values(insights.utilization.distribution))) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="w-12 text-sm text-neutral-900 text-right">{count}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <BarChart3 className="mx-auto h-12 w-12 text-neutral-400" />
              <h3 className="mt-2 text-sm font-medium text-neutral-900">No distribution data</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Utilization distribution not available
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Recommendations */}
      {insights?.recommendations && insights.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-neutral-200">
            <h3 className="text-lg font-medium text-neutral-900">AI Recommendations</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Smart suggestions for resource optimization
            </p>
          </div>
          
          <div className="p-6">
            <div className="space-y-3">
              {insights.recommendations.map((recommendation, index) => (
                <div key={index} className="flex items-start">
                  <div className="flex-shrink-0">
                    <Brain className="h-5 w-5 text-blue-600 mt-0.5" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-neutral-700">{recommendation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
