import { useEffect, useState, useRef } from "react";
import { useAuth } from "../context/AuthContext";

type SSEEventHandler = (data: any) => void;

export function useSSE(eventTypes: string[], callback: SSEEventHandler) {
  const { token } = useAuth();
  const [error, setError] = useState<Error | null>(null);

  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!token) return;

    const eventSource = new EventSource(`${import.meta.env.VITE_API_URL}/events/stream?token=${token}`);

    eventSource.onopen = () => {
      setError(null);
    };

    eventSource.onerror = (err) => {
      console.error("SSE Error:", err);
      setError(new Error("SSE connection error"));
    };

    const listeners: { type: string; listener: (e: MessageEvent) => void }[] = [];

    eventTypes.forEach((type) => {
      const listener = (event: MessageEvent) => {
        try {
          const parsedData = JSON.parse(event.data);
          callbackRef.current({ type, data: parsedData });
        } catch (e) {
          console.error("Failed to parse SSE data", e);
        }
      };
      eventSource.addEventListener(type, listener);
      listeners.push({ type, listener });
    });

    return () => {
      listeners.forEach(({ type, listener }) => {
        eventSource.removeEventListener(type, listener);
      });
      eventSource.close();
    };
  }, [token, eventTypes.join(",")]);

  return { error };
}
