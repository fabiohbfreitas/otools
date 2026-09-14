use anyhow::Result;

use crate::model::ParsedRow;
use crate::normalize::{match_headers, normalize_text, resolve_specialty, sanitize_folder_name};
use crate::phone::{extract_and_select_phones, normalize_phone};

pub fn run_selftest() -> Result<()> {
    println!("Executing pipeline self-tests...");

    assert_eq!(normalize_text("Laboratório"), "LABORATORIO");
    assert_eq!(normalize_text("Clínica Médica"), "CLINICAMEDICA");
    assert_eq!(
        normalize_text("US DE ABDOMEN TOTAL"),
        "USDEABDOMENTOTAL"
    );

    assert_eq!(
        resolve_specialty("Cardiologia.xlsx"),
        Some("Cardiologia")
    );
    assert_eq!(
        resolve_specialty("Exames Laboratoriais"),
        Some("ExameLaboratorial")
    );
    assert_eq!(
        resolve_specialty("US DE ABDOMEN TOTAL"),
        Some("Ecografia")
    );
    assert_eq!(
        resolve_specialty("CARDIOLOGISTA"),
        Some("Cardiologia")
    );

    assert_eq!(sanitize_folder_name("24/08"), "24_08");
    assert_eq!(sanitize_folder_name("A:B*C"), "A_B_C");

    let headers = vec![
        "Nome do Paciente".to_string(),
        "TELEFONE(S)".to_string(),
        "DATA/HORA".to_string(),
        "ESPECIALIDADE".to_string(),
    ];
    let matched = match_headers(&headers).expect("Failed header match");
    assert_eq!(matched.nome, 0);
    assert_eq!(matched.telefone, 1);
    assert_eq!(matched.data, 2);
    assert_eq!(matched.especialidade, 3);

    assert_eq!(normalize_phone("91981234567"), "(91) 98123-4567");
    assert_eq!(normalize_phone("9132223344"), "(91) 3222-3344");

    let (chosen, others) =
        extract_and_select_phones("Fixo 91 3222-1111 / Celular (91) 98888-2222");
    assert_eq!(chosen, "(91) 98888-2222");
    assert_eq!(others, vec!["(91) 3222-1111".to_string()]);

    let parsed = ParsedRow {
        source_row_idx: 2,
        nome: "Maria Silva".to_string(),
        primary_phone: "(91) 98888-2222".to_string(),
        other_phones: vec!["(91) 3222-1111".to_string()],
        date: "2026-08-24".to_string(),
    };
    let output = parsed.to_output_row("Cardiologia");

    assert_eq!(output.nome, "Maria Silva");
    assert_eq!(output.telefone, "(91) 98888-2222");
    assert_eq!(
        output.etiquetas,
        "2026-08-24, Automação, Cardiologia, SaudeDaGente, Marajo"
    );
    assert_eq!(output.notas_internas, "Outros telefones: (91) 3222-1111");

    println!("All self-tests passed successfully.");
    Ok(())
}