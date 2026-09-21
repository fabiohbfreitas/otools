import { prisma } from "@/lib/prisma";
import { JsonStringArray } from "@/lib/schemas";
import UploadForm from "./upload-form";

export default async function Importar() {
  const batches = await prisma.importBatch.findMany({ orderBy: { importedAt: "desc" }, take: 10 });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Importar pacientes</h1>
          <p>
            Suba a exportação do sistema (xlsx): um arquivo por polo ou um arquivo combinado (vale a
            primeira aba; o polo vem da coluna Unidade). Pacientes existentes são atualizados pelo
            telefone.
          </p>
        </div>
      </div>
      <div className="card">
        <UploadForm />
      </div>
      <h2>Últimas importações</h2>
      {batches.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Abas</th>
                <th>Linhas</th>
                <th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.fileName}</td>
                  <td>{JsonStringArray.parse(b.sheets).join(", ")}</td>
                  <td>{b.rows}</td>
                  <td>{b.importedAt.toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <strong>Nenhuma importação ainda</strong>
        </div>
      )}
    </>
  );
}
