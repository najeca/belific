// The iPhone's emoji picker set (3.13.0): a small hand-picked list per category (the picker on the desktop
// has all of emojibase, lib/emojiData.ts, which stays off the phone: the iOS marker gate). Nothing here is
// searched; the phone's emoji keyboard (its own search) is the way to any other emoji. Pure: NO runtime imports.
// One string per category, emojis separated by a space; keys are those of lib/emojiCategories.ts.
const SETS: Record<string, string> = {
  smileys: '😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 😍 🤩 😘 😋 😎 🤓 🤔 😐 😴 😌 🥳 😤 😢 😭 😡 🥶 😱 🤗 🙃',
  people: '👋 👍 👏 🙌 🙏 💪 🤝 ✌️ 👀 🧠 🫶 👶 🧒 👩 👨 🧑‍💻 🧑‍🍳 🧑‍🎨 🧑‍🏫 🧑‍⚕️ 🏃 🚶 🧘 🏋️ 🚴 💃 🛌 🤸 👪 🧑‍🤝‍🧑',
  animals: '🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🦁 🐸 🐵 🐔 🐧 🐦 🦉 🦋 🐝 🐢 🐙 🐬 🐳 🌱 🌳 🌸 🌻 🌼 🍀 🌍 ⭐ 🌈',
  food: '🍎 🍌 🍇 🍓 🍉 🍑 🥑 🥕 🌽 🥦 🍞 🧀 🍳 🥗 🍕 🍔 🍜 🍣 🍪 🍰 🍫 🍿 ☕ 🍵 🥤 🍺 🍷 🧃 🛒 🍽️',
  activities: '⚽ 🏀 🏈 🎾 🏐 🏓 🥊 🎯 🎮 🕹️ 🎲 🧩 🎨 🎭 🎬 🎤 🎧 🎸 🎹 🎻 🏆 🥇 🎳 ⛳ 🏊 🚴 🎣 🧗 🎉 🎁',
  travel: '🚗 🚕 🚌 🚆 ✈️ 🚀 🚲 🛵 🚢 ⛵ 🏠 🏡 🏢 🏫 🏥 🏦 🏪 ⛪ 🗽 🏖️ 🏔️ 🌋 🏕️ 🗺️ 🧳 ⛽ 🌅 🌃 🏰 🎡',
  objects: '💡 📱 💻 ⌨️ 🖥️ 📷 📚 📖 📝 ✏️ 📌 📎 📅 📋 📁 🗂️ 💼 🎒 🔑 🔧 🔨 🧹 🧺 🛏️ 💰 💳 ⏰ ⌚ 📦 ✉️',
  symbols: '❤️ 🧡 💛 💚 💙 💜 🖤 ⭐ ✨ 🔥 ⚡ 💧 ✅ ❌ ❗ ❓ 💯 ➕ ➖ ♻️ 🔔 🔒 🚩 ⚠️ 🏁 💤 🎵 🔁 🆕 ❇️',
};

export const CURATED: Readonly<Record<string, readonly string[]>> = Object.fromEntries(Object.entries(SETS).map(([k, v]) => [k, v.split(' ')]));
