'use client';

import React, { Component, type ReactNode, type ErrorInfo } from 'react';
import RemoteFallbackCard from './RemoteFallbackCard';

interface FederatedErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallbackMessage?: string;
}

interface FederatedErrorBoundaryState {
  readonly hasError: boolean;
  readonly errorMessage: string;
}

/**
 * Catches client-side and hydration errors arising from external/federated modules
 * so that a remote error does not unmount or crash the Host application.
 */
export class FederatedErrorBoundary extends Component<
  FederatedErrorBoundaryProps,
  FederatedErrorBoundaryState
> {
  public override state: FederatedErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): FederatedErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Unknown federated component error',
    };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Structured log for observability
    console.error('Federated Component Crash Captured by ErrorBoundary:', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <RemoteFallbackCard
          reason={this.state.errorMessage || this.props.fallbackMessage}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

export default FederatedErrorBoundary;
