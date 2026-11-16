/**
 * JobApply form filler. Runs inside the application page when you click
 * "Fill this page". It only fills empty text fields, dropdowns and the cover
 * letter box — it never clicks submit, never touches passwords or file inputs,
 * and never answers a question it isn't sure about.
 */
(() => {
  // Checked in order; the first rule whose pattern matches a field's label wins.
  const RULES = [
    { key: "email", test: /e-?mail/i, type: "email" },
    { key: "phone", test: /phone|mobile|telephone|\btel\b/i, type: "tel" },
    { key: "linkedin", test: /linkedin/i },
    { key: "github", test: /github/i },
    { key: "firstName", test: /first[\s_-]?name|given[\s_-]?name|\bfname\b|preferred name/i },
    { key: "lastName", test: /last[\s_-]?name|family[\s_-]?name|surname|\blname\b/i },
    { key: "currentCompany", test: /current[\s_-]?(company|employer)|company[\s_-]?name|\bemployer\b|\borganization\b/i },
    { key: "currentTitle", test: /current[\s_-]?(title|role|position)|job[\s_-]?title|\btitle\b/i },
    { key: "school", test: /school|university|college|institution/i },
    { key: "degree", test: /\bdegree\b/i },
    { key: "coverLetter", test: /cover[\s_-]?letter/i },
    { key: "yearsExperience", test: /years?.{0,20}experience|experience.{0,12}years/i },
    { key: "salaryExpectation", test: /salary|compensation|desired pay|pay expectation/i },
    { key: "noticePeriod", test: /notice period|start date|when can you start|availability/i },
    { key: "requiresSponsorship", test: /sponsor/i },
    { key: "workAuthorization", test: /authori[sz]|right to work|eligib\w* to work|work permit|visa status/i },
    { key: "portfolio", test: /portfolio|website|personal (site|url)|\burl\b/i },
    { key: "city", test: /\bcity\b/i },
    { key: "location", test: /location|address|where are you (based|located)/i },
    { key: "fullName", test: /full[\s_-]?name|legal name|your name|^\s*name\b|\bname\s*\*?\s*$/i },
  ];

  const AUTOCOMPLETE = {
    "given-name": "firstName",
    "family-name": "lastName",
    name: "fullName",
    email: "email",
    tel: "phone",
    "organization-title": "currentTitle",
    organization: "currentCompany",
    "address-level2": "city",
    url: "portfolio",
  };

  function labelFor(el) {
    const parts = [];
    if (el.labels) for (const l of el.labels) parts.push(l.textContent);
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) for (const id of labelledBy.split(/\s+/)) parts.push(document.getElementById(id)?.textContent);
    parts.push(el.getAttribute("aria-label"), el.placeholder);
    if (!parts.some((p) => p && p.trim())) {
      // No proper label: look for text in the field's wrapper.
      const wrapper = el.closest("label, .field, .form-group, .application-question, [class*='field'], [class*='question'], li, div");
      if (wrapper && wrapper.textContent.length < 200) parts.push(wrapper.textContent);
    }
    parts.push(el.name, el.id);
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function keyFor(el) {
    const auto = (el.getAttribute("autocomplete") || "").toLowerCase().split(/\s+/).pop();
    if (AUTOCOMPLETE[auto]) return AUTOCOMPLETE[auto];
    const label = labelFor(el);
    if (!label) return null;
    for (const rule of RULES) {
      if (rule.type && el.type === rule.type) return rule.key;
      if (rule.test.test(label)) return rule.key;
    }
    return null;
  }

  // Frameworks like React ignore plain `el.value = x`; go through the native setter and fire real events.
  function setValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function chooseOption(select, key, value) {
    const options = [...select.options].filter((o) => o.value !== "");
    const wanted = String(value).trim().toLowerCase();
    if (!wanted) return false;
    let pick = null;
    if (key === "requiresSponsorship") {
      // Only answer a plain yes/no dropdown.
      pick = options.find((o) => new RegExp(`^\\s*${wanted}\\b`, "i").test(o.textContent));
    } else {
      pick = options.find((o) => o.textContent.trim().toLowerCase() === wanted) || options.find((o) => o.textContent.toLowerCase().includes(wanted));
    }
    if (!pick) return false;
    setValue(select, pick.value);
    return true;
  }

  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  window.__jobApplyFill = function (fields, coverLetter) {
    const values = { ...fields, coverLetter: coverLetter || "" };
    const filled = [];
    const skipped = [];
    const SKIP_TYPES = new Set(["hidden", "password", "file", "checkbox", "radio", "submit", "button", "image", "reset", "range", "color", "date"]);

    for (const el of document.querySelectorAll("input, textarea, select")) {
      if (el.disabled || el.readOnly || !visible(el)) continue;
      if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
      const key = keyFor(el);
      if (!key) continue;
      const value = values[key];
      const name = labelFor(el).slice(0, 60);
      if (!value) {
        skipped.push(name);
        continue;
      }
      if (el.value && el.value.trim()) continue; // never overwrite what's already there
      // Long text belongs in a textarea; a one-line field labelled "cover letter" is usually a file picker's caption.
      if (key === "coverLetter" && !(el instanceof HTMLTextAreaElement)) continue;
      const ok = el instanceof HTMLSelectElement ? chooseOption(el, key, value) : (setValue(el, String(value)), true);
      if (!ok) {
        skipped.push(name);
        continue;
      }
      el.style.outline = "2px solid #1d5c4c";
      el.style.outlineOffset = "1px";
      filled.push(name);
    }
    return { filled, skipped };
  };
})();
