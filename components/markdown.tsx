import ReactMarkdown from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed [&_a]:underline [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold [&_h4]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground [&_em]:text-muted-foreground">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
