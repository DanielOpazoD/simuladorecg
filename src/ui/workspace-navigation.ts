type WorkspaceActions = Record<
  "about" | "measurements" | "export" | "close-dialog",
  () => void
>;

export class WorkspaceNavigation {
  constructor(
    private readonly catalog: Pick<HTMLElement, "classList">,
    private readonly inspector: Pick<HTMLElement, "scrollIntoView" | "focus">,
    private readonly actions: WorkspaceActions,
  ) {}

  handle(action: string, concealed: boolean): boolean {
    switch (action) {
      case "parameters":
        if (!concealed) {
          this.inspector.scrollIntoView({ block: "start" });
          this.inspector.focus({ preventScroll: true });
        }
        return true;
      case "catalog":
        this.catalog.classList.toggle("open");
        return true;
      case "close-catalog":
        this.catalog.classList.remove("open");
        return true;
      case "about":
      case "measurements":
      case "export":
      case "close-dialog":
        this.actions[action]();
        return true;
      default:
        return false;
    }
  }
}
