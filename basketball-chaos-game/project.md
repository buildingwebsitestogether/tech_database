# Sam's DevHub - Basketball Chaos Arcade & Portfolio

Welcome to my personal student portfolio and interactive showcase! This single-page web application features interactive project cards, a search and filter system, and a custom HTML5 Canvas browser game: **Basketball Chaos Arcade**.

Built as part of Mr. Smith's **Building With AI** class.

---

## 📍 Where We Are Right Now

* **Current Status**: Project source code is finalized as a single-page HTML application.
* **Core Functionality**: Features personalized student portfolio cards, dynamic tag search, responsive mobile UI, and full browser History API integration (`pushState` / `popstate`) for back-button support.
* **Game Integration**: *Basketball Chaos Arcade* is fully functional inside a modal view with trajectory aiming, Web Audio API SFX, an in-game Chaos Shop, and single-file HTML export capabilities.
* **Next Steps**: Resolving cache clearing during deployment updates and publishing the live GitHub Pages URL link.

---

## 🚀 Features

* **Personalized Student Portfolio**: Showcases web applications, custom tools, and technical skills.
* **Basketball Chaos Arcade**: A fully integrated browser game built with pure HTML5 Canvas physics.
  * Drag-to-aim trajectory arc with realistic power vectors.
  * Web Audio API synthesized sound effects (swish, rim clang, bounce, coin pickup).
  * In-game Chaos Shop, scoring streak multipliers, and multiple difficulty levels.
  * Standalone single-file HTML export capability.
* **Seamless Navigation**: Integrated History API (`pushState` / `popstate`) supporting browser back-button navigation for modals.
* **Fully Responsive UI**: Built with Tailwind CSS and FontAwesome icons, tailored for desktop and mobile screens.

---

## 🛠️ Tech Stack

* **Frontend Framework**: HTML5, Tailwind CSS (via CDN), JavaScript (ES6+)
* **Graphics & Sound**: HTML5 Canvas API, Web Audio API
* **Typography & Icons**: FontAwesome 6, Google Fonts (Chakra Petch, Fira Code, Inter, Russo One)

---

## 📁 File Structure

```text
├── index.html        # Main single-page web application & embedded game engine
├── project.md        # Project documentation and setup guide
└── README.md         # Repository overview