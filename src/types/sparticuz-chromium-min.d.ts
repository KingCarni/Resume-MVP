declare module "@sparticuz/chromium-min" {
  export const args: string[];
  export const defaultViewport: any;
  export const headless: any;
  export function executablePath(input?: string): Promise<string>;
}
