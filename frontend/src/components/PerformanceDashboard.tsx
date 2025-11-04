import React, { useState, useEffect } from 'react';
import { performanceMonitor, getPerformanceRecommendations, getMemoryUsage } from '@/lib/performance';
import Card from './Card';
import { CardContent, CardHeader, CardTitle } from './CardComponents';
import Badge from './Badge';
import Alert from './Alert';

const PerformanceDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<{
    loadTime: number;
    firstContentfulPaint: number;
    largestContentfulPaint: number;
    firstInputDelay: number;
    cumulativeLayoutShift: number;
    timeToInteractive: number;
    totalBlockingTime: number;
  } | null>(null);
  const [resourceTimings, setResourceTimings] = useState<Array<{
    name: string;
    duration: number;
    size: number;
    type: string;
  }>>([]);
  const [memoryUsage, setMemoryUsage] = useState<{
    used: number;
    total: number;
    limit: number;
  } | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);

  useEffect(() => {
    const updateMetrics = () => {
      const currentMetrics = performanceMonitor.getMetrics();
      const currentResources = performanceMonitor.getResourceTimings();
      const currentMemory = getMemoryUsage();

      setMetrics(currentMetrics);
      setResourceTimings(currentResources);
      setMemoryUsage(currentMemory);

      if (currentMetrics) {
        const recs = getPerformanceRecommendations(currentMetrics);
        setRecommendations(recs);
      }
    };

    // Update metrics every 5 seconds
    const interval = setInterval(updateMetrics, 5000);
    updateMetrics(); // Initial update

    return () => clearInterval(interval);
  }, []);

  const getPerformanceScore = (metric: number, thresholds: { good: number; needsImprovement: number }): 'good' | 'needs-improvement' | 'poor' => {
    if (metric <= thresholds.good) return 'good';
    if (metric <= thresholds.needsImprovement) return 'needs-improvement';
    return 'poor';
  };

  const getScoreColor = (score: string) => {
    switch (score) {
      case 'good': return 'bg-green-100 text-green-800';
      case 'needs-improvement': return 'bg-yellow-100 text-yellow-800';
      case 'poor': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTime = (ms: number) => `${ms.toFixed(0)}ms`;
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!metrics) {
    return (
      <div className="p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Core Web Vitals */}
      <Card>
        <CardHeader>
          <CardTitle>Core Web Vitals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Largest Contentful Paint</span>
                <Badge className={getScoreColor(getPerformanceScore(metrics.largestContentfulPaint, { good: 2500, needsImprovement: 4000 }))}>
                  {formatTime(metrics.largestContentfulPaint)}
                </Badge>
              </div>
              <div className="text-xs text-gray-500">
                Good: ≤2.5s, Needs Improvement: ≤4.0s
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">First Input Delay</span>
                <Badge className={getScoreColor(getPerformanceScore(metrics.firstInputDelay, { good: 100, needsImprovement: 300 }))}>
                  {formatTime(metrics.firstInputDelay)}
                </Badge>
              </div>
              <div className="text-xs text-gray-500">
                Good: ≤100ms, Needs Improvement: ≤300ms
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Cumulative Layout Shift</span>
                <Badge className={getScoreColor(getPerformanceScore(metrics.cumulativeLayoutShift, { good: 0.1, needsImprovement: 0.25 }))}>
                  {metrics.cumulativeLayoutShift.toFixed(3)}
                </Badge>
              </div>
              <div className="text-xs text-gray-500">
                Good: ≤0.1, Needs Improvement: ≤0.25
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Performance Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Load Time</span>
                <span className="text-sm font-mono">{formatTime(metrics.loadTime)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">First Contentful Paint</span>
                <span className="text-sm font-mono">{formatTime(metrics.firstContentfulPaint)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Time to Interactive</span>
                <span className="text-sm font-mono">{formatTime(metrics.timeToInteractive)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Blocking Time</span>
                <span className="text-sm font-mono">{formatTime(metrics.totalBlockingTime)}</span>
              </div>
              {memoryUsage && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Memory Used</span>
                    <span className="text-sm font-mono">{memoryUsage.used}MB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Memory Limit</span>
                    <span className="text-sm font-mono">{memoryUsage.limit}MB</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resource Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>Resource Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {resourceTimings.length}
                </div>
                <div className="text-sm text-gray-500">Total Resources</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {resourceTimings.filter(r => r.duration > 1000).length}
                </div>
                <div className="text-sm text-gray-500">Slow Resources (&gt;1s)</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {resourceTimings.filter(r => r.size > 100000).length}
                </div>
                <div className="text-sm text-gray-500">Large Resources (&gt;100KB)</div>
              </div>
            </div>

            {resourceTimings.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Slowest Resources</h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {resourceTimings
                    .sort((a, b) => b.duration - a.duration)
                    .slice(0, 5)
                    .map((resource, index) => (
                      <div key={index} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded">
                        <span className="truncate flex-1 mr-2" title={resource.name}>
                          {resource.name.split('/').pop()}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-gray-500">{formatTime(resource.duration)}</span>
                          <span className="text-gray-400">{formatBytes(resource.size)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recommendations.map((recommendation, index) => (
                <Alert key={index} className="text-sm">
                  <span className="font-medium">💡</span>
                  <span className="ml-2">{recommendation}</span>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PerformanceDashboard;
