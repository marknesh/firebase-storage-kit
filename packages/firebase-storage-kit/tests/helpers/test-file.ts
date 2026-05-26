export const createTestFile = (name: string, content = "test-content"): File =>
  new File([content], name, { type: "application/octet-stream" });
