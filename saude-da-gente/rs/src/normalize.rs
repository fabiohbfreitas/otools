use unicode_normalization::UnicodeNormalization;

pub fn normalize_text(text: &str) -> String {
    text.nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect::<String>()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

pub fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            _ => c,
        })
        .collect()
}

const ALIAS_TABLE: &[(&[&str], &str)] = &[
    (&["LABORATOR"], "ExameLaboratorial"),
    (&["CARDIOLOGIA", "CARDIOLOGISTA"], "Cardiologia"),
    (&["DERMATOLOGIA", "DERMATOLOGISTA"], "Dermatologia"),
    (
        &[
            "ECOGRAFIA",
            "USDEABDOMENTOTAL",
            "USDETIREOIDE",
            "USMAMARIA",
        ],
        "Ecografia",
    ),
    (&["GINECOLOGIA", "GINECOLOGISTA"], "Ginecologia"),
    (&["MAMOGRAFIA"], "Mamografia"),
    (&["ORTOPEDIA", "ORTOPEDISTA"], "Ortopedia"),
    (&["PEDIATRIA", "PEDIATRA"], "Pediatria"),
    (&["REUMATOLOGIA", "REUMATOLOGISTA"], "Reumatologia"),
    (&["ENDOCRINOLOGIA", "ENDOCRINOLOGISTA"], "Endocrinologia"),
    (
        &["OTORRINO", "OTORRINOLARINGOLOGIA"],
        "Otorrinolaringologia",
    ),
    (&["CLINICAMEDICA"], "ClinicaMedica"),
];

pub fn resolve_specialty(raw: &str) -> Option<&'static str> {
    let norm = normalize_text(raw);
    if norm.is_empty() {
        return None;
    }

    for (tokens, canonical) in ALIAS_TABLE {
        for &token in *tokens {
            if norm.contains(token) || token.contains(&norm) {
                return Some(canonical);
            }
        }
    }
    None
}

pub struct HeaderIndices {
    pub nome: usize,
    pub telefone: usize,
    pub data: usize,
    pub especialidade: usize,
}

pub fn match_headers(raw_headers: &[String]) -> Option<HeaderIndices> {
    let mut nome = None;
    let mut telefone = None;
    let mut data = None;
    let mut especialidade = None;

    for (i, header) in raw_headers.iter().enumerate() {
        let norm = normalize_text(header);
        if norm.contains("NOME") {
            nome = Some(i);
        } else if norm.contains("TELEFONE") {
            telefone = Some(i);
        } else if norm.contains("DATA") || norm.contains("HORA") {
            data = Some(i);
        } else if norm.contains("ESPECIALIDADE") {
            especialidade = Some(i);
        }
    }

    Some(HeaderIndices {
        nome: nome?,
        telefone: telefone?,
        data: data?,
        especialidade: especialidade?,
    })
}