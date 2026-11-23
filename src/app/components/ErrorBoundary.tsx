import { Component, ErrorInfo, ReactNode } from 'react';

type ErrorBoundaryProps = {
  fallback: (error: unknown) => ReactNode;
  children: ReactNode;
};
type ErrorBoundaryState = { failed: false } | { failed: true; error: unknown };

// Contains a render error to its subtree; hostile or malformed content must not unmount the app.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Render error contained by ErrorBoundary', error, info.componentStack);
  }

  render() {
    const { state } = this;
    const { fallback, children } = this.props;
    return state.failed ? fallback(state.error) : children;
  }
}
