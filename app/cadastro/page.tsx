import { redirect } from "next/navigation";

// Superado por /inscricao (formulário real: nome, e-mail, WhatsApp com
// máscara, ligado aos botões dos planos). O sandbox que gerou este projeto
// não teve permissão de apagar este arquivo do disco — só sobrescrever.
export default function CadastroRedirect() {
  redirect("/inscricao");
}
