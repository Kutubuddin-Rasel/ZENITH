// Performance monitoring and optimization utilities
export interface PerformanceMetrics {
  loadTime: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  totalBlockingTime: number;
}

export interface ResourceTiming {
  name: string;
  duration: number;
  size: number;
  type: string;
}

interface FirstInputEntry extends PerformanceEntry {
  processingStart: number;
}

interface LayoutShiftEntry extends PerformanceEntry {
  hadRecentInput: boolean;
  value: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics | null = null;
  private resourceTimings: ResourceTiming[] = [];
  private observers: PerformanceObserver[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeObservers();
      this.captureInitialMetrics();
    }
  }

  private initializeObservers(): void {
    // LCP Observer
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      const lcpObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry;
        if (this.metrics) {
          this.metrics.largestContentfulPaint = lastEntry.startTime;
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      this.observers.push(lcpObserver);

      // FID Observer
      const fidObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries();
        entries.forEach((entry: PerformanceEntry) => {
          if (this.metrics) {
            this.metrics.firstInputDelay = (entry as FirstInputEntry).processingStart - entry.startTime;
          }
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.push(fidObserver);

      // CLS Observer
      const clsObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
        let clsValue = 0;
        const entries = list.getEntries();
        entries.forEach((entry: PerformanceEntry) => {
          if (!(entry as LayoutShiftEntry).hadRecentInput) {
            clsValue += (entry as LayoutShiftEntry).value;
          }
        });
        if (this.metrics) {
          this.metrics.cumulativeLayoutShift = clsValue;
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);

      // Resource Observer
      const resourceObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
        const entries = list.getEntries();
        entries.forEach((entry: PerformanceEntry) => {
          const resourceEntry = entry as PerformanceResourceTiming;
          this.resourceTimings.push({
            name: resourceEntry.name,
            duration: resourceEntry.duration,
            size: resourceEntry.transferSize || 0,
            type: resourceEntry.initiatorType,
          });
        });
      });
      resourceObserver.observe({ entryTypes: ['resource'] });
      this.observers.push(resourceObserver);
    }
  }

  private captureInitialMetrics(): void {
    if (typeof window === 'undefined') return;

    // Wait for page load
    window.addEventListener('load', () => {
      setTimeout(() => {
        this.captureMetrics();
      }, 1000);
    });

      // Capture FCP
      if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
        const fcpObserver = new PerformanceObserver((list: PerformanceObserverEntryList) => {
          const entries = list.getEntries();
          const fcpEntry = entries.find((entry: PerformanceEntry) => entry.name === 'first-contentful-paint');
        if (fcpEntry && this.metrics) {
          this.metrics.firstContentfulPaint = fcpEntry.startTime;
        }
      });
      fcpObserver.observe({ entryTypes: ['paint'] });
      this.observers.push(fcpObserver);
    }
  }

  private captureMetrics(): void {
    if (typeof window === 'undefined') return;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    this.metrics = {
      loadTime: navigation.loadEventEnd - navigation.fetchStart,
      firstContentfulPaint: 0, // Set by observer
      largestContentfulPaint: 0, // Set by observer
      firstInputDelay: 0, // Set by observer
      cumulativeLayoutShift: 0, // Set by observer
      timeToInteractive: this.calculateTTI(),
      totalBlockingTime: this.calculateTBT(),
    };

    // Log performance metrics
    this.logMetrics();
  }

  private calculateTTI(): number {
    if (typeof window === 'undefined') return 0;

    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const loadTime = navigation.loadEventEnd - navigation.fetchStart;
    
    // Simple TTI calculation (in real implementation, use web-vitals library)
    return loadTime * 1.5;
  }

  private calculateTBT(): number {
    if (typeof window === 'undefined') return 0;

    const longTasks = performance.getEntriesByType('longtask') as PerformanceEntry[];
    return longTasks.reduce((total: number, task: PerformanceEntry) => total + task.duration, 0);
  }

  private logMetrics(): void {
    if (!this.metrics) return;

    console.group('🚀 Performance Metrics');
    console.log('Load Time:', `${this.metrics.loadTime.toFixed(2)}ms`);
    console.log('First Contentful Paint:', `${this.metrics.firstContentfulPaint.toFixed(2)}ms`);
    console.log('Largest Contentful Paint:', `${this.metrics.largestContentfulPaint.toFixed(2)}ms`);
    console.log('First Input Delay:', `${this.metrics.firstInputDelay.toFixed(2)}ms`);
    console.log('Cumulative Layout Shift:', this.metrics.cumulativeLayoutShift.toFixed(4));
    console.log('Time to Interactive:', `${this.metrics.timeToInteractive.toFixed(2)}ms`);
    console.log('Total Blocking Time:', `${this.metrics.totalBlockingTime.toFixed(2)}ms`);
    console.groupEnd();

    // Send to analytics (implement your analytics service)
    this.sendToAnalytics();
  }

  private sendToAnalytics(): void {
    if (!this.metrics) return;

    // Example: Send to your analytics service
    if (typeof window !== 'undefined' && 'gtag' in window) {
      (window as { gtag: (command: string, eventName: string, parameters: Record<string, unknown>) => void }).gtag('event', 'performance_metrics', {
        load_time: this.metrics.loadTime,
        fcp: this.metrics.firstContentfulPaint,
        lcp: this.metrics.largestContentfulPaint,
        fid: this.metrics.firstInputDelay,
        cls: this.metrics.cumulativeLayoutShift,
        tti: this.metrics.timeToInteractive,
        tbt: this.metrics.totalBlockingTime,
      });
    }
  }

  public getMetrics(): PerformanceMetrics | null {
    return this.metrics;
  }

  public getResourceTimings(): ResourceTiming[] {
    return this.resourceTimings;
  }

  public getSlowResources(threshold: number = 1000): ResourceTiming[] {
    return this.resourceTimings.filter(resource => resource.duration > threshold);
  }

  public getLargeResources(threshold: number = 100000): ResourceTiming[] {
    return this.resourceTimings.filter(resource => resource.size > threshold);
  }

  public cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Utility functions
export const preloadResource = (href: string, as: string): void => {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preload';
  link.href = href;
  link.as = as;
  document.head.appendChild(link);
};

export const prefetchResource = (href: string): void => {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  document.head.appendChild(link);
};

export const preconnectToOrigin = (origin: string): void => {
  if (typeof window === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = origin;
  document.head.appendChild(link);
};

// Image optimization utilities
export const getOptimizedImageUrl = (
  src: string,
  width: number,
  height?: number,
  quality: number = 75
): string => {
  // In production, use your image optimization service
  if (process.env.NODE_ENV === 'production') {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${width}${height ? `&h=${height}` : ''}&q=${quality}`;
  }
  return src;
};

// Lazy loading utilities
export const createIntersectionObserver = (
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver | null => {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  return new IntersectionObserver(callback, {
    rootMargin: '50px',
    threshold: 0.1,
    ...options,
  });
};

// Bundle size analysis
export const analyzeBundleSize = (): void => {
  if (typeof window === 'undefined') return;

  const scripts = Array.from(document.querySelectorAll('script[src]'));
  const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  
  console.group('📦 Bundle Analysis');
  console.log('Scripts:', scripts.length);
  console.log('Stylesheets:', stylesheets.length);
  
  scripts.forEach(script => {
    const src = (script as HTMLScriptElement).src;
    console.log('Script:', src);
  });
  
  stylesheets.forEach(link => {
    const href = (link as HTMLLinkElement).href;
    console.log('Stylesheet:', href);
  });
  
  console.groupEnd();
};

// Memory usage monitoring
export const getMemoryUsage = (): {
  used: number;
  total: number;
  limit: number;
} | null => {
  if (typeof window === 'undefined') return null;

  const memory = (performance as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (memory) {
    return {
      used: Math.round(memory.usedJSHeapSize / 1048576), // MB
      total: Math.round(memory.totalJSHeapSize / 1048576), // MB
      limit: Math.round(memory.jsHeapSizeLimit / 1048576), // MB
    };
  }
  return null;
};

// Performance recommendations
export const getPerformanceRecommendations = (metrics: PerformanceMetrics): string[] => {
  const recommendations: string[] = [];

  if (metrics.loadTime > 3000) {
    recommendations.push('Consider code splitting to reduce initial bundle size');
  }

  if (metrics.firstContentfulPaint > 1800) {
    recommendations.push('Optimize critical rendering path and reduce render-blocking resources');
  }

  if (metrics.largestContentfulPaint > 2500) {
    recommendations.push('Optimize images and lazy load non-critical content');
  }

  if (metrics.firstInputDelay > 100) {
    recommendations.push('Reduce JavaScript execution time and break up long tasks');
  }

  if (metrics.cumulativeLayoutShift > 0.1) {
    recommendations.push('Add size attributes to images and avoid inserting content above existing content');
  }

  if (metrics.timeToInteractive > 3800) {
    recommendations.push('Reduce JavaScript bundle size and optimize third-party scripts');
  }

  if (metrics.totalBlockingTime > 200) {
    recommendations.push('Split long tasks and use web workers for heavy computations');
  }

  return recommendations;
};
