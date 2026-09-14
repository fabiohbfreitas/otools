use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OutputRow {
    #[serde(rename = "Nome")]
    pub nome: String,
    #[serde(rename = "Telefone")]
    pub telefone: String,
    #[serde(rename = "Etiquetas")]
    pub etiquetas: String,
    #[serde(rename = "Notas Internas")]
    pub notas_internas: String,
}

#[derive(Debug, Clone)]
pub struct ParsedRow {
    pub source_row_idx: usize,
    pub nome: String,
    pub primary_phone: String,
    pub other_phones: Vec<String>,
    pub date: String,
}

impl ParsedRow {
    pub fn to_output_row(&self, canonical_specialty: &str) -> OutputRow {
        let etiquetas = format!(
            "{}, Automação, {}, SaudeDaGente, Marajo",
            self.date, canonical_specialty
        );

        let notas_internas = if self.other_phones.is_empty() {
            String::new()
        } else {
            format!("Outros telefones: {}", self.other_phones.join(", "))
        };

        OutputRow {
            nome: self.nome.clone(),
            telefone: self.primary_phone.clone(),
            etiquetas,
            notas_internas,
        }
    }
}