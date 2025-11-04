import { useState, useEffect, useRef, RefObject } from 'react';
import { createIntersectionObserver } from '@/lib/performance';

interface UseLazyLoadOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

interface UseLazyLoadReturn {
  isVisible: boolean;
  ref: RefObject<HTMLElement | null>;
}

export const useLazyLoad = (options: UseLazyLoadOptions = {}): UseLazyLoadReturn => {
  const {
    threshold = 0.1,
    rootMargin = '50px',
    triggerOnce = true,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = createIntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (triggerOnce) {
              observer?.disconnect();
            }
          } else if (!triggerOnce) {
            setIsVisible(false);
          }
        });
      },
      { threshold, rootMargin }
    );

    if (observer) {
      observer.observe(element);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, [threshold, rootMargin, triggerOnce]);

  return { isVisible, ref };
};

// Hook for lazy loading with data fetching
export const useLazyData = <T>(
  fetchFn: () => Promise<T>,
  options: UseLazyLoadOptions = {}
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isVisible, ref } = useLazyLoad(options);

  useEffect(() => {
    if (isVisible && !data && !loading) {
      setLoading(true);
      setError(null);

      fetchFn()
        .then((result) => {
          setData(result);
        })
        .catch((err) => {
          setError(err);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isVisible, data, loading, fetchFn]);

  return { data, loading, error, ref, isVisible };
};

// Hook for progressive image loading
export const useProgressiveImage = (src: string, placeholder?: string) => {
  const [imageSrc, setImageSrc] = useState(placeholder || '');
  const [imageRef, setImageRef] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
    };
    img.src = src;
    setImageRef(img);
  }, [src]);

  return { src: imageSrc, ref: imageRef };
};

// Hook for virtual scrolling
export const useVirtualScroll = (
  itemHeight: number,
  containerHeight: number,
  itemCount: number
) => {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight) + 1,
    itemCount
  );

  const visibleItems = Array.from(
    { length: visibleEnd - visibleStart },
    (_, index) => ({
      index: visibleStart + index,
      top: (visibleStart + index) * itemHeight,
    })
  );

  const totalHeight = itemCount * itemHeight;

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return {
    visibleItems,
    totalHeight,
    handleScroll,
  };
};

// Hook for performance monitoring
export const usePerformanceMonitor = () => {
  const [metrics, setMetrics] = useState<{
    loadTime: number;
    domContentLoaded: number;
    firstPaint: number;
    firstContentfulPaint: number;
  } | null>(null);

  useEffect(() => {
    const updateMetrics = () => {
      if (typeof window !== 'undefined' && window.performance) {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (navigation) {
          setMetrics({
            loadTime: navigation.loadEventEnd - navigation.fetchStart,
            domContentLoaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
            firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
            firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0,
          });
        }
      }
    };

    if (document.readyState === 'complete') {
      updateMetrics();
    } else {
      window.addEventListener('load', updateMetrics);
    }

    return () => {
      window.removeEventListener('load', updateMetrics);
    };
  }, []);

  return metrics;
};
