type MermaidTheme = "default" | "neutral" | "forest" | "dark" | "base";

interface MermaidRenderResult {
  svg: string;
  bindFunctions?: (element: Element) => void;
}

interface MermaidApi {
  initialize: (config: {
    startOnLoad: boolean;
    theme: MermaidTheme;
    securityLevel: "strict";
    fontFamily: string;
  }) => void;
  render: (
    id: string,
    text: string,
  ) => MermaidRenderResult | Promise<MermaidRenderResult>;
}
