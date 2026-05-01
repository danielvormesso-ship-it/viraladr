/// <reference types="vite/client" />

declare global {
  interface Window {
    Tawk_API?: {
      maximize?: () => void;
      minimize?: () => void;
      hideWidget?: () => void;
      showWidget?: () => void;
      toggle?: () => void;
      setAttributes?: (attrs: any, callback?: any) => void;
    };
    Tawk_LoadStart?: Date;
  }
}

export {};
