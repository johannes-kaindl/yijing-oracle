/** Wickelt einen Body in einen Obsidian-Callout. Jede Body-Zeile wird mit "> " geprefixt;
 *  Leerzeilen werden zu ">" (ohne Space), damit der Callout nicht abbricht. Pure. */
export function wrapCallout(title: string, body: string, type: string, open: boolean): string {
  const marker = open ? "+" : "-";
  const head = `> [!${type}]${marker} ${title}`.trimEnd();
  const lines = body.split("\n").map(l => (l.length === 0 ? ">" : `> ${l}`));
  return [head, ...lines].join("\n");
}
