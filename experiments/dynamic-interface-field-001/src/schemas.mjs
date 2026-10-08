import Ajv from "ajv";
import { readFileSync } from "node:fs";
const ajv = new Ajv({ allErrors: true, strict: false }),
  validators = new Map();
export function validateDynamic(name, value) {
  if (!validators.has(name))
    validators.set(
      name,
      ajv.compile(
        JSON.parse(
          readFileSync(
            new URL("../schemas/" + name + ".schema.json", import.meta.url),
            "utf8",
          ),
        ),
      ),
    );
  const check = validators.get(name);
  if (!check(value))
    throw new Error(
      "DYNAMIC_SCHEMA:" + name + ":" + ajv.errorsText(check.errors),
    );
  return value;
}
