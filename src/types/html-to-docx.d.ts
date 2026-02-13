declare module "html-to-docx" {
  type HtmlToDocxOptions = Record<string, any>;

  const htmlToDocx: (
    html: string,
    fileName?: string | null,
    options?: HtmlToDocxOptions
  ) => Promise<Buffer>;

  export default htmlToDocx;
}
