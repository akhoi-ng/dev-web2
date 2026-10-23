/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FDF3EF", 100: "#FBE7DF", 200: "#F6CDBF", 300: "#EDA48E", 400: "#E0735A",
          500: "#CC4A2F", 600: "#B8321C", 700: "#9A2816", 800: "#7A2013", 900: "#5C1910",
        },
        saffron: "#F4B13E",
        cream: "#FFF8F2",
        ink: "#2B1B17",
      },
    },
  },
  plugins: [],
};
