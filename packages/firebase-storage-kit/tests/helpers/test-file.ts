export function createTestFile(name: string, content: string = "test-content"): File {
  return new File([content], name, { type: "application/octet-stream" });
}
