import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence against a white page.
 *
 * A render-time throw anywhere below unmounts the whole React tree, which on the
 * kitchen board reads as "the app died mid-service" with no way back. This turns
 * that into a message and a retry, and keeps the failure visible in the console
 * for whoever is debugging it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-surface-muted flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-surface rounded-2xl flat-shadow border border-gray-100 p-6 text-center space-y-4">
          <h1 className="text-lg font-black text-gray-900">Something broke on this screen</h1>
          <p className="text-sm text-gray-500">
            The page stopped rather than showing you the wrong thing. Your order data is safe on the server.
          </p>
          <p className="text-xs text-gray-400 font-mono break-words">{this.state.error.message}</p>
          <div className="flex gap-3 justify-center pt-1">
            <button
              onClick={this.handleReset}
              className="rounded-xl bg-brand-600 text-white px-5 py-2.5 font-semibold hover:bg-brand-700 transition"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-gray-100 text-gray-700 px-5 py-2.5 font-semibold hover:bg-gray-200 transition"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
