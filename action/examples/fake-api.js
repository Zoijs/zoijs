// A pretend API for the examples — resolves (or rejects) after a short delay so
// you can see the pending state. Swap these for real fetch() calls in your app.

export const delay = (value, ms = 700) =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

export const fail = (message, ms = 700) =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
