import type { DockviewApi } from "dockview-core";

/** Default draggable layout for the interface editor (dockview). */
export function applyInterfaceEditorWorkbenchLayout(api: DockviewApi): void {
  if (api.getPanel("iface-preview")) {
    return;
  }

  api.addPanel({
    id: "iface-preview",
    component: "ifacePreview",
    title: "Client preview",
    // The preview is the point of the editor: the side columns give way before it does.
    minimumWidth: 320,
  });

  api.addPanel({
    id: "iface-interfaces",
    component: "ifaceInterfaces",
    title: "Interfaces",
    position: { referencePanel: "iface-preview", direction: "left" },
    initialWidth: 240,
    minimumWidth: 160,
  });

  api.addPanel({
    id: "iface-component-tree",
    component: "ifaceComponentTree",
    title: "Component view",
    position: { referencePanel: "iface-preview", direction: "right" },
    initialWidth: 380,
    minimumWidth: 220,
  });

  api.addPanel({
    id: "iface-client-script",
    component: "ifaceClientScript",
    title: "Client script",
    position: { referencePanel: "iface-component-tree", direction: "within" },
    inactive: true,
  });

  api.addPanel({
    id: "iface-component-editor",
    component: "ifaceComponentEditor",
    title: "Component editor",
    position: { referencePanel: "iface-component-tree", direction: "below" },
    initialHeight: 320,
    minimumHeight: 160,
  });

  // Panel options alone leave the preview with whatever the side columns do not take (about 150px in a laptop
  // window), so set the column sizes and the preview's minimum explicitly.
  const preview = api.getPanel("iface-preview");
  const list = api.getPanel("iface-interfaces");
  const tree = api.getPanel("iface-component-tree");
  preview?.group.api.setConstraints({ minimumWidth: 320 });
  list?.group.api.setConstraints({ minimumWidth: 160 });
  tree?.group.api.setConstraints({ minimumWidth: 220 });
  list?.group.api.setSize({ width: 240 });
  tree?.group.api.setSize({ width: 380 });
}
