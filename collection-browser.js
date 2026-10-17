/* Keep long collections compact without replacing their existing cards. */
(() => {
  "use strict";

  const normalize = value => String(value || "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const compare = (left, right) => left.localeCompare(right, undefined, {
    sensitivity: "base", numeric: true
  });

  document.querySelectorAll("[data-collection]").forEach(root => {
    if (root.classList.contains("is-ready")) return;

    const form = root.querySelector("[data-collection-tools]");
    const search = form && form.querySelector("[data-collection-search]");
    const sort = form && form.querySelector("[data-collection-sort]");
    const viewport = root.querySelector("[data-collection-viewport]");
    const list = root.querySelector("[data-collection-list]");
    const count = root.querySelector("[data-collection-count]");
    const empty = root.querySelector("[data-collection-empty]");
    const filters = form ? [...form.querySelectorAll("[data-collection-filter]")] : [];
    const fields = new Set(["role", "team", "topic", "speaker"]);

    if (!form || !search || !sort || !viewport || !list || !count || !empty ||
        filters.some(filter => !fields.has(filter.dataset.field) ||
          !filter.options.length || filter.options[0].value !== "")) return;

    const cards = [...list.querySelectorAll("[data-collection-card]")].map((element, index) => ({
      element,
      index,
      title: element.dataset.title || "",
      text: normalize([element.textContent, element.dataset.title,
        ...[...element.querySelectorAll("img[alt]")].map(image => image.alt)].join(" "))
    }));
    const pausedFrames = new WeakMap();
    let currentSort = "original";

    filters.forEach(filter => {
      const values = [...new Set(cards.map(card =>
        (card.element.dataset[filter.dataset.field] || "").trim()).filter(Boolean))].sort(compare);
      while (filter.options.length > 1) filter.remove(1);
      values.forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        filter.append(option);
      });
      filter.value = "";
    });

    const setVisible = (card, visible) => {
      const wasVisible = !card.element.hidden;
      if (wasVisible === visible) return;
      card.element.hidden = !visible;
      card.element.querySelectorAll("iframe").forEach(frame => {
        if (!visible) {
          const source = frame.getAttribute("src");
          if (source !== null) {
            pausedFrames.set(frame, source);
            frame.removeAttribute("src");
          }
        } else if (pausedFrames.has(frame)) {
          frame.setAttribute("src", pausedFrames.get(frame));
          pausedFrames.delete(frame);
        }
      });
    };

    const update = () => {
      const terms = normalize(search.value).split(" ").filter(Boolean);
      let visibleCount = 0;
      cards.forEach(card => {
        const visible = terms.every(term => card.text.includes(term)) &&
          filters.every(filter => !filter.value ||
            (card.element.dataset[filter.dataset.field] || "").trim() === filter.value);
        setVisible(card, visible);
        if (visible) visibleCount += 1;
      });

      const nextSort = ["az", "za"].includes(sort.value) ? sort.value : "original";
      if (nextSort !== currentSort) {
        const ordered = [...cards].sort((left, right) => {
          if (nextSort === "original") return left.index - right.index;
          const result = compare(left.title, right.title);
          return (nextSort === "za" ? -result : result) || left.index - right.index;
        });
        ordered.forEach(card => list.append(card.element));
        currentSort = nextSort;
      }

      const unit = cards.length === 1 ? (root.dataset.single || root.dataset.unit) : root.dataset.unit;
      count.textContent = `${visibleCount} of ${cards.length} ${unit || "items"}`;
      empty.hidden = visibleCount !== 0;
      viewport.scrollTop = 0;
    };

    const reset = () => {
      search.value = "";
      filters.forEach(filter => { filter.value = ""; });
      sort.value = "original";
      update();
      search.focus({ preventScroll: true });
    };

    form.addEventListener("submit", event => event.preventDefault());
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("reset", event => {
      event.preventDefault();
      reset();
    });
    root.querySelectorAll("[data-collection-clear]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        reset();
      });
    });

    update();
    form.hidden = false;
    root.classList.add("is-ready");
  });
})();
