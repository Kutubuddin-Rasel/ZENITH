import React, { Suspense, ComponentType, ReactNode } from 'react';
import { useLazyLoad, useLazyData } from '@/hooks/useLazyLoad';

interface LazyComponentProps {
  children: ReactNode;
  fallback?: ReactNode;
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

const DefaultFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

const LazyComponent: React.FC<LazyComponentProps> = ({
  children,
  fallback = <DefaultFallback />,
  threshold = 0.1,
  rootMargin = '50px',
  triggerOnce = true,
}) => {
  const { isVisible, ref } = useLazyLoad({
    threshold,
    rootMargin,
    triggerOnce,
  });

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      {isVisible ? (
        <Suspense fallback={fallback}>
          {children}
        </Suspense>
      ) : (
        fallback
      )}
    </div>
  );
};

// Higher-order component for lazy loading
export const withLazyLoad = <P extends object>(
  Component: ComponentType<P>,
  fallback?: ReactNode
) => {
  const LazyWrappedComponent = (props: P) => (
    <LazyComponent fallback={fallback}>
      <Component {...props} />
    </LazyComponent>
  );

  LazyWrappedComponent.displayName = `withLazyLoad(${Component.displayName || Component.name})`;
  
  return LazyWrappedComponent;
};

// Lazy load with data fetching
interface LazyDataComponentProps<T> {
  fetchData: () => Promise<T>;
  children: (data: T) => ReactNode;
  fallback?: ReactNode;
  errorFallback?: (error: Error) => ReactNode;
  threshold?: number;
  rootMargin?: string;
}

const LazyDataComponent = <T,>({
  fetchData,
  children,
  fallback = <DefaultFallback />,
  errorFallback = (error) => (
    <div className="p-4 text-red-600">
      Error loading data: {error.message}
    </div>
  ),
  threshold = 0.1,
  rootMargin = '50px',
}: LazyDataComponentProps<T>) => {
  const { data, loading, error, ref } = useLazyData(fetchData, {
    threshold,
    rootMargin,
  });

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      {loading && fallback}
      {error && errorFallback(error)}
      {data && children(data)}
    </div>
  );
};

export { LazyDataComponent };

export default LazyComponent;
