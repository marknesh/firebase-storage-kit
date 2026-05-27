import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions = (): BaseLayoutProps => ({
  links: [
    {
      external: true,
      text: "GitHub",
      url: "https://github.com/marknesh/firebase-storage-kit",
    },
  ],
  nav: {
    title: "firebase-storage-kit",
  },
});
