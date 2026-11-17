"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { HOSTED } from "@/lib/mode";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { useAccount } from "@/components/AccountGate";
import { Button } from "./ui";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const { signedIn } = useAccount();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const updateDisplay = () => setInstalled(display.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    updateDisplay();
    display.addEventListener("change", updateDisplay);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      display.removeEventListener("change", updateDisplay);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    setBusy(true);
    setMessage("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "dismissed") setMessage("You can install later from your browser’s menu.");
    } catch {
      setMessage("Use your browser’s installation menu below to try again.");
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  }

  if (installed) return null;

  return (
    <section aria-label="Install JobApply" className="mb-5 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">JobApply, one click away</p>
          <p className="mt-1 text-muted">Add an app icon and open JobApply in its own window. Free, with automatic updates.</p>
        </div>
        {prompt && <Button icon={<Download className="size-4" aria-hidden />} variant="primary" loading={busy} onClick={() => void install()}>Install JobApply</Button>}
      </div>
      <details className="mt-2 text-muted">
        <summary className="cursor-pointer font-medium text-accent">{prompt ? "Installation help" : "How to install"}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Windows or Android:</strong> open this site in Chrome or Edge, then use the install option in the address bar or browser menu.</li>
          <li><strong>iPhone or iPad:</strong> open in Safari, tap Share, then Add to Home Screen. If offered, keep Open as Web App switched on.</li>
          <li><strong>Mac:</strong> in Safari choose File → Add to Dock, or install from Chrome’s menu.</li>
        </ul>
        <p className="mt-2">An internet connection is required. Updates appear when you reopen or reload the app.</p>
        <p className="mt-2">{signedIn ? "Sign in with the same account on any device to access your saved profile and applications." : ACCOUNTS_ENABLED ? "Sign in to access saved information in the installed app. Guest information is temporary and disappears when the page is reloaded or closed." : HOSTED
          ? "Use the same browser to install if you have already entered information. Some devices use separate app storage; Settings → Your data lets you back up and restore your information."
          : "This local copy needs its JobApply server running. For an app that opens without starting a server, install the shared online version."}</p>
        {!HOSTED && <a className="mt-2 inline-block font-medium text-accent underline" href="https://job-apply-three.vercel.app/">Open the online app</a>}
      </details>
      {message && <p role="status" className="mt-2 text-muted">{message}</p>}
    </section>
  );
}
