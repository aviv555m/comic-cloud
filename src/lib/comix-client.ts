import axios, { AxiosAdapter, AxiosResponse } from 'axios';
import { supabase } from '@/integrations/supabase/client';

// Detect environments
const isCapacitor = () => {
  return typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
};

const isDev = import.meta.env.DEV;

export const comixAdapter: AxiosAdapter = async (config) => {
  // Determine target comix.to path
  let targetPath = config.url || '';
  if (targetPath.startsWith('http')) {
    try {
      const parsedUrl = new URL(targetPath);
      targetPath = parsedUrl.pathname;
    } catch (e) {
      console.error("[Comix Client] Failed to parse config.url as absolute URL:", targetPath);
    }
  }

  if (!targetPath.startsWith('/')) {
    targetPath = '/' + targetPath;
  }
  if (!targetPath.startsWith('/api/v1')) {
    targetPath = '/api/v1' + targetPath;
  }

  // Construct query parameters
  const params = new URLSearchParams();
  if (config.params) {
    Object.entries(config.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        params.append(key, String(val));
      }
    });
  }
  const queryString = params.toString();
  
  const absoluteComixUrl = `https://comix.to${targetPath}${queryString ? '?' + queryString : ''}`;

  console.log(`[Comix Client] Adapter routing request for: ${config.url}. Absolute URL: ${absoluteComixUrl}`);

  let responseData: any;
  let responseHeaders: Record<string, string> = {};
  let responseStatus = 200;

  if (isCapacitor()) {
    // Mobile APK: Route through cloud proxy edge function to bypass WebView forbidden header (Referer/User-Agent) restrictions
    const { data, error } = await supabase.functions.invoke('public-library-proxy', {
      body: { url: absoluteComixUrl, responseType: 'json' }
    });

    if (error) {
      throw error;
    }
    if (!data?.success) {
      throw new Error(data?.error || 'Proxy request failed');
    }

    responseData = data.data;
    responseStatus = 200;
  } else if (isDev) {
    // Use Vite Dev Proxy
    const proxyUrl = `/api-comix${targetPath}${queryString ? '?' + queryString : ''}`;
    const response = await fetch(proxyUrl, {
      method: config.method?.toUpperCase() || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(config.headers as Record<string, string>),
      }
    });
    responseStatus = response.status;
    const text = await response.text();
    try {
      responseData = JSON.parse(text);
    } catch {
      responseData = text;
    }
    response.headers.forEach((val, key) => {
      responseHeaders[key.toLowerCase()] = val;
    });
  } else {
    // Web production: Route through public-library-proxy edge function
    const { data, error } = await supabase.functions.invoke('public-library-proxy', {
      body: { url: absoluteComixUrl, responseType: 'json' }
    });

    if (error) {
      throw error;
    }
    if (!data?.success) {
      throw new Error(data?.error || 'Proxy request failed');
    }

    responseData = data.data;
    responseStatus = 200;
  }

  // Inject x-enc if encrypted payload is present in the response (for all environments)
  if (responseData && typeof responseData === 'object' && responseData.e) {
    responseHeaders['x-enc'] = '1';
  }

  // Create standard AxiosResponse object
  const response: AxiosResponse = {
    data: responseData,
    status: responseStatus,
    statusText: responseStatus === 200 ? 'OK' : 'Error',
    headers: responseHeaders,
    config,
  };

  return response;
};

// Create axios instance using our custom adapter
export const comixAxios = axios.create({
  adapter: comixAdapter,
  baseURL: 'https://comix.to/api/v1',
  headers: {
    'Accept': 'application/json',
  }
});

let vmInitialized = false;
let initPromise: Promise<void> | null = null;

export async function initComixClient() {
  if (vmInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Fetch secure-th470v-BWGNYMGc.js from the public directory
      const response = await fetch('/secure-th470v-BWGNYMGc.js');
      if (!response.ok) {
        throw new Error(`Failed to load comix secure script: ${response.statusText}`);
      }
      let content = await response.text();
      // Remove export line so eval/Function doesn't complain about exports
      content = content.replace("export{n as a,co as i,so as n,t as o,r,Or as s,Jr as t};", "");

      // Setup window/document mock context for the VM to run successfully
      const mockContext = {
        getImageData: () => ({ data: new Uint8Array(400) }),
        putImageData: () => {},
        drawImage: () => {},
        fillRect: () => {},
        fillText: () => {},
        measureText: () => ({ width: 10 }),
        createImageData: () => ({ data: new Uint8Array(400) }),
        gl: {},
      };

      const mockCanvas = {
        getContext: () => mockContext,
        width: 100,
        height: 100,
        toDataURL: () => "data:image/png;base64,",
      };

      const mockLocation = {
        href: "https://comix.to/",
        hostname: "comix.to",
        host: "comix.to",
        protocol: "https:",
        origin: "https://comix.to"
      };

      // Mock window proxy to shadow location, window, globalThis, top, parent, self
      const mockWindow = new Proxy(window || globalThis, {
        get(target, prop) {
          if (prop === 'location') return mockLocation;
          if (prop === 'window' || prop === 'globalThis' || prop === 'top' || prop === 'parent' || prop === 'self') return mockWindow;
          return (target as any)[prop];
        }
      });

      const mockNavigator = {
        userAgent: navigator?.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        appCodeName: "Mozilla"
      };

      const mockDocument = {
        createElement: (tag: string) => tag === 'canvas' ? mockCanvas : { style: {} },
        createElementNS: () => ({ style: {} }),
        getElementsByTagName: () => [],
        querySelector: () => ({ getAttribute: () => null, textContent: '', style: {} }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        head: { appendChild: () => {} },
        body: { appendChild: () => {}, style: {} },
        documentElement: { style: {} },
      };

      // Create function wrapper and run VM
      const vmWrapper = new Function("window", "document", "location", "navigator", "globalThis", "self", content);
      vmWrapper(mockWindow, mockDocument, mockLocation, mockNavigator, mockWindow, mockWindow);

      if (typeof (globalThis as any).co !== 'function') {
        throw new Error("co function was not defined after running secure VM");
      }

      // Register the interceptors to our comixAxios instance
      (globalThis as any).co(comixAxios);
      
      vmInitialized = true;
      console.log("Comix VM initialized successfully.");
    } catch (e) {
      console.error("Failed to initialize Comix VM:", e);
      throw e;
    }
  })();

  return initPromise;
}
