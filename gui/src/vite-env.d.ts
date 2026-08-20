/// <reference types="vite/client" />

interface Window {
  api: {
    getDefaultBinaryPath: () => Promise<string | null>;
    selectBinary: () => Promise<string | null>;
    checkBinary: (filePath: string) => Promise<boolean>;
    runSearch: (args: { binaryPath: string; domains: string[]; tlds: string[]; extraArgs?: string[] }) => void;
    cancelSearch: () => void;
    onSearchStdout: (callback: (data: string) => void) => () => void;
    onSearchStderr: (callback: (data: string) => void) => () => void;
    onSearchError: (callback: (data: string) => void) => () => void;
    onSearchExit: (callback: (code: number) => void) => () => void;
    removeAllListeners: () => void;
  };
}
