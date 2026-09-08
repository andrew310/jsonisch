// The one shiki theme for branded code on the site — a minimal TextMate
// theme carrying the brand's code palette: strings pink, punctuation and
// braces cyan-leaning, keywords Signal. Both the landing example and the
// /api reference render through this object; restyle code here only.
export const jsonischTheme = {
  name: "jsonisch",
  type: "dark" as const,
  colors: {
    "editor.background": "#101014",
    "editor.foreground": "#EDEDF2",
  },
  settings: [
    { settings: { foreground: "#EDEDF2", background: "#101014" } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#6E6E78", fontStyle: "italic" },
    },
    {
      scope: ["string", "punctuation.definition.string"],
      settings: { foreground: "#FF3D8F" },
    },
    {
      scope: ["punctuation", "meta.brace"],
      settings: { foreground: "#5FB8DC" },
    },
    {
      scope: ["keyword", "storage.type", "storage.modifier"],
      settings: { foreground: "#EDEDF2" },
    },
    { scope: ["constant.numeric"], settings: { foreground: "#45D4FF" } },
    {
      scope: [
        "entity.name.function",
        "support.function",
        "entity.name.tag",
        "support.class.component",
      ],
      settings: { foreground: "#45D4FF" },
    },
    {
      scope: [
        "variable",
        "variable.other",
        "variable.parameter",
        "entity.other.attribute-name",
      ],
      settings: { foreground: "#C6C6CF" },
    },
    {
      scope: ["meta.object-literal.key", "support.type.property-name"],
      settings: { foreground: "#9A9AA3" },
    },
  ],
};
