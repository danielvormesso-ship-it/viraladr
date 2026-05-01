import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Termos = () => (
  <div className="min-h-screen bg-background text-foreground px-4 py-12">
    <div className="max-w-2xl mx-auto space-y-8">
      <Link to="/login" className="text-sm text-primary/60 hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Voltar
      </Link>

      <h1 className="text-3xl font-bold">Termos de Uso</h1>
      <p className="text-sm text-muted-foreground">Última atualização: 01 de maio de 2026</p>

      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. O Serviço</h2>
          <p>
            O CriativosIA é uma plataforma de curadoria e edição de vídeos curtos para criadores de conteúdo.
            O serviço permite descobrir, filtrar, baixar e editar vídeos de fontes públicas para repostagem em redes sociais.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Cadastro e Conta</h2>
          <p>
            Ao criar uma conta, você declara ter pelo menos 18 anos e se responsabiliza pela segurança de suas credenciais.
            Cada pessoa pode manter apenas uma conta ativa.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Planos e Pagamento</h2>
          <p>
            Os planos pagos são processados via Hotmart. O valor cobrado corresponde ao plano escolhido,
            com renovação mensal automática. Créditos não utilizados não acumulam para o mês seguinte.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Reembolso</h2>
          <p>
            Reembolsos seguem a política do Hotmart e o Código de Defesa do Consumidor.
            Você pode solicitar reembolso em até 7 dias após a compra, diretamente pela plataforma Hotmart.
            Após o período, cancelamentos encerram o acesso ao final do ciclo de cobrança.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Uso Aceitável</h2>
          <p>
            Você concorda em não utilizar o serviço para: distribuição de conteúdo ilegal, spam em massa,
            violação de direitos autorais de terceiros, ou qualquer atividade que viole leis brasileiras.
            O uso indevido pode resultar em suspensão ou encerramento da conta sem reembolso.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Propriedade Intelectual</h2>
          <p>
            Os vídeos disponibilizados no pool são de fontes públicas. O CriativosIA não garante direitos
            de uso comercial sobre os vídeos. A responsabilidade pelo uso do conteúdo baixado é exclusivamente do usuário.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Limitação de Responsabilidade</h2>
          <p>
            O serviço é fornecido "como está". Não garantimos disponibilidade ininterrupta ou que os vídeos
            estarão sempre acessíveis. Não nos responsabilizamos por perdas decorrentes de indisponibilidade
            temporária, falhas técnicas ou uso inadequado do conteúdo.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Alterações</h2>
          <p>
            Podemos alterar estes termos a qualquer momento. Alterações significativas serão comunicadas
            pela plataforma. O uso continuado após alterações constitui aceite dos novos termos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Foro</h2>
          <p>
            Fica eleito o foro da comarca de São Paulo/SP para dirimir quaisquer controvérsias
            decorrentes destes termos, com renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Termos;
