export function mountKanshan(container) {
  const character = document.createElement("div");
  character.className = "kanshan-sprite";

  const image = document.createElement("img");
  image.src = `${import.meta.env.BASE_URL}assets/liukanshan-three-quarter-v2.png`;
  image.alt = "刘看山侧身面向现场观众";
  image.draggable = false;

  const gesture = document.createElement("div");
  gesture.className = "kanshan-gesture";
  gesture.setAttribute("aria-hidden", "true");
  gesture.innerHTML = "<span>?</span><i></i><i></i>";

  character.append(image, gesture);
  container.replaceChildren(character);
  container.dataset.ready = "true";
  container.dataset.phase = "idle";

  return {
    setPhase(next) {
      container.dataset.phase = next;
      character.dataset.phase = next;
    }
  };
}
