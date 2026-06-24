// A pretend API for the examples — resolves after a short delay so you can see
// the loading state. Swap these for real fetch() calls in your own app.

export const delay = (value, ms = 700) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const fail = (message, ms = 700) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

export const sampleUser = {
  name: "Ada Lovelace",
  title: "Computing pioneer",
};

export const samplePosts = [
  { id: 1, title: "Why no build step?", body: "Open an HTML file and you're running." },
  { id: 2, title: "Fine-grained updates", body: "Only the text node that changed updates." },
  { id: 3, title: "Secure by default", body: "Text is inert; dangerous URLs are blocked." },
];
