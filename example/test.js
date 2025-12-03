import { createOrbit } from "../dist/index.js";

const orbitConfig = `
app {
    name: "orbit"
    features: ["parser", "runtime"]
}
`;

const main = async () => {
  const orbit = await createOrbit();
  const evalResult = orbit.evaluate(orbitConfig);
  console.log(evalResult);
  console.log(evalResult.app);
  console.log(`App name: ${evalResult.app.name}`);
  console.log(`App features: ${evalResult.app.features.join(", ")}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
