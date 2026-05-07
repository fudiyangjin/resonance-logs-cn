use crate::parser_data;
use log::warn;
use serde_json::{Map, Value};
use std::sync::OnceLock;

const DAMAGE_FORMULA_RELATIVE: &str = "logic/DamageFormula.json";

static DAMAGE_FORMULA: OnceLock<Value> = OnceLock::new();

pub fn damage_formula_definition() -> &'static Value {
    DAMAGE_FORMULA.get_or_init(load_damage_formula_definition)
}

fn load_damage_formula_definition() -> Value {
    let contents = match parser_data::read_to_string(DAMAGE_FORMULA_RELATIVE) {
        Ok(contents) => contents,
        Err(err) => {
            warn!(
                target: "app::live",
                "damage_formula_load_failed path={} error={}",
                DAMAGE_FORMULA_RELATIVE,
                err
            );
            return Value::Object(Map::new());
        }
    };

    match serde_json::from_str::<Value>(&contents) {
        Ok(value) => value,
        Err(err) => {
            warn!(
                target: "app::live",
                "damage_formula_parse_failed path={} error={}",
                DAMAGE_FORMULA_RELATIVE,
                err
            );
            Value::Object(Map::new())
        }
    }
}
