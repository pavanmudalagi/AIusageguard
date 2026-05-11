export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        guard: {
          ink: "#14213d",
          teal: "#0f766e",
          blue: "#2563eb",
          amber: "#b45309",
          rose: "#be123c"
        }
      }
    }
  },
  plugins: []
};
