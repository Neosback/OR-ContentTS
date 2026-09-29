import net from "net";

const DAEMON_PORT = 9095;
const DAEMON_HOST = "127.0.0.1";

function queryDaemon(tool: string, params: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ port: DAEMON_PORT, host: DAEMON_HOST }, () => {
      client.write(JSON.stringify({ tool, params }) + "\n");
    });
    let buffer = "";
    client.on("data", (chunk) => {
      buffer += chunk.toString();
    });
    client.on("end", () => {
      try {
        resolve(JSON.parse(buffer));
      } catch (e) {
        reject(new Error(`Failed to parse response: ${buffer.slice(0, 100)}`));
      }
    });
    client.on("error", (err) => {
      reject(
        new Error(
          `Cannot connect to OSRS Render Daemon at ${DAEMON_HOST}:${DAEMON_PORT}.\n` +
            `Make sure it is running: bash /Users/tylercovalt/Documents/osrs-mcp/start-daemon.sh\n` +
            `Error: ${err.message}`
        )
      );
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const objectId = parseInt(args[0] ?? "1911", 10);
  const shapeType = parseInt(args[1] ?? "0", 10);
  const orientation = parseInt(args[2] ?? "1", 10);

  console.log(`\n======================================================`);
  console.log(`  OSRS Render Diagnostic Oracle — Object ID: ${objectId}`);
  console.log(`======================================================\n`);

  try {
    // 1. Inspect Base Definition
    const base = await queryDaemon("inspect_object_base", { objectId });
    console.log(`[1] BASE DEFINITION`);
    console.log(`    Name:               ${base.name}`);
    console.log(`    Footprint (Size):   ${base.sizeX} x ${base.sizeY}`);
    console.log(`    Ambient / Contrast: ${base.ambient} / ${base.contrast} (Lit: ${base.lightingAmbient} / ${base.lightingContrast})`);
    console.log(`    Decor Displacement: ${base.decorDisplacement} units`);
    console.log(`    Offsets (X, Y, Z):  (${base.offsetX}, ${base.offsetY}, ${base.offsetZ})`);
    console.log(`    Model Sizes (X,Y,Z):(${base.modelSizeX}, ${base.modelSizeY}, ${base.modelSizeZ})`);
    console.log(`    Merge Normals:      ${base.mergeNormals ? "YES (nonFlatShading)" : "NO"}`);
    console.log(`    Contoured Ground:   ${base.contouredGround !== 0 ? `YES (Type ${base.contouredGround})` : "NO"}`);
    console.log(`    Face Z-Offsets:     ${base.hasFaceZOffsets ? `YES on models [${base.modelsWithFaceZOffsets?.join(", ")}]` : "NO"}`);
    console.log(`    Sub-models (${base.models?.length ?? 0}):`);
    for (const m of base.models ?? []) {
      console.log(`      - Model ${m.modelId} (Shape ${m.shapeType})`);
    }

    // 2. Simulate Placement
    const placement = await queryDaemon("simulate_placement", {
      objectId,
      type: shapeType,
      orientation,
    });
    console.log(`\n[2] PLACEMENT SIMULATION (Shape ${shapeType}, Orient ${orientation})`);
    console.log(`    Shape Name:         ${placement.shapeName}`);
    if (placement.wallCornerEntities) {
      console.log(`    L-Corner Entity 0:  Rotation ${placement.wallCornerEntities.entity0Rotation} (${placement.wallCornerEntities.entity0Description})`);
      console.log(`    L-Corner Entity 1:  Rotation ${placement.wallCornerEntities.entity1Rotation} (${placement.wallCornerEntities.entity1Description})`);
    }
    if (placement.wallDecorDisplacement) {
      console.log(`    Wall Decor Offset:  dx=${placement.wallDecorDisplacement.deltaX}, dz=${placement.wallDecorDisplacement.deltaZ}`);
      console.log(`    Z-Fighting Risk:    ${placement.wallDecorDisplacement.zFightingRisk}`);
    }

    // 3. Shader Contract
    const shader = await queryDaemon("generate_shader_contract", { objectId, type: shapeType });
    console.log(`\n[3] SHADER & GPU CONTRACT`);
    console.log(`    Draw Pass:          ${shader.drawPass}`);
    console.log(`    Face Count:         ${shader.facePriorities?.faceCount ?? "N/A"}`);
    console.log(`    Priority Range:     ${shader.facePriorities?.minPriority ?? 0} .. ${shader.facePriorities?.maxPriority ?? 0}`);
    console.log(`    Standard-Z Bias:    ${shader.depthBias?.standardZInstruction ?? "None"}`);
    console.log(`    Reverse-Z Bias:     ${shader.depthBias?.reverseZInstruction ?? "None"}`);
    console.log(`    Z-Fighting Risk:    ${shader.zFightingRisk?.overall} (${shader.zFightingRisk?.recommendation})`);

    console.log(`\n======================================================\n`);
  } catch (err: any) {
    console.error(`Diagnostic failed: ${err.message}`);
    process.exit(1);
  }
}

main();
