// Ensure BETTER_AUTH_URL has protocol before any module reads it
if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.startsWith("http")) {
  process.env.BETTER_AUTH_URL = `https://${process.env.BETTER_AUTH_URL}`;
}
