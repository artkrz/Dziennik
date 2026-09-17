import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_LABELS, THEMES, Theme } from "../lib/theme";
import { useTheme } from "../lib/useTheme";
import { Button } from "./ui/button";

const THEME_ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export default function ThemeSetting() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">Motyw</span>
      <div className="flex gap-2" role="group" aria-label="Wybór motywu">
        {THEMES.map((option) => {
          const Icon = THEME_ICONS[option];
          const active = option === theme;
          return (
            <Button
              key={option}
              variant={active ? "default" : "outline"}
              size="sm"
              aria-pressed={active}
              onClick={() => setTheme(option)}
            >
              <Icon />
              {THEME_LABELS[option]}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
