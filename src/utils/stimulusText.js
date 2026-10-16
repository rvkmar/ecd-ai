// Text an examinee would read from a stimulus block. Content is either a
// string or a typed object ({ text }, { altText, caption }, { latex }).
// String(object) is "[object Object]", which is what the instantiated-task
// list was printing.

export function stimulusBlockText(block) {
  if (!block) return "";
  const content = block.content;
  if (typeof content === "string") return content.trim();
  if (content && typeof content === "object") {
    for (const key of ["text", "altText", "caption", "latex"]) {
      if (typeof content[key] === "string" && content[key].trim()) {
        return content[key].trim();
      }
    }
  }
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  return "";
}
