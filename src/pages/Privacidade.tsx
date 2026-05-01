import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const Privacidade = () => (
  <div className="min-h-screen bg-background text-foreground px-4 py-12">
    <div className="max-w-2xl mx-auto space-y-8">
      <Link to="/login" className="text-sm text-primary/60 hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> Voltar
      </Link>

      <h1 className="text-3xl font-bold">Política de Privacidade</h1>
      <p className="text-sm text-muted-foreground">Última atualização: 01 de maio de 2026</p>

      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">1. Dados que Coletamos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Cadastro:</strong> nome de usuário, email e telefone (opcional).</li>
            <li><strong>Uso:</strong> vídeos baixados, edições realizadas, histórico de atividade.</li>
            <li><strong>Pagamento:</strong> dados de transação processados pelo Hotmart (não armazenamos dados de cartão).</li>
            <li><strong>Marketing:</strong> parâmetros UTM (source, medium, campaign) para atribuição de campanha.</li>
            <li><strong>Técnicos:</strong> endereço IP em logs de webhook.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">2. Finalidade do Uso</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Prover e manter o serviço de curadoria e edição de vídeos.</li>
            <li>Processar pagamentos e gerenciar assinaturas.</li>
            <li>Enviar comunicações sobre o serviço (transacionais).</li>
            <li>Melhorar o produto com base em dados agregados de uso.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">3. Compartilhamento</h2>
          <p>Seus dados podem ser compartilhados com:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Hotmart:</strong> processamento de pagamentos e gestão de assinaturas.</li>
            <li><strong>Supabase:</strong> hospedagem de banco de dados e autenticação.</li>
            <li><strong>Netlify:</strong> hospedagem da aplicação web.</li>
          </ul>
          <p className="mt-2">Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de marketing.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">4. Seus Direitos (LGPD)</h2>
          <p>Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Acesso:</strong> solicitar quais dados pessoais possuímos sobre você.</li>
            <li><strong>Correção:</strong> solicitar correção de dados incompletos ou incorretos.</li>
            <li><strong>Exclusão:</strong> solicitar a exclusão de seus dados pessoais e conta.</li>
            <li><strong>Portabilidade:</strong> solicitar seus dados em formato legível por máquina.</li>
            <li><strong>Revogação:</strong> revogar o consentimento a qualquer momento.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">5. Exclusão de Conta</h2>
          <p>
            Você pode excluir sua conta a qualquer momento através das configurações do perfil.
            A exclusão remove seus dados pessoais, histórico de uso e credenciais de acesso.
            Dados anonimizados podem ser mantidos para fins estatísticos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">6. Cookies</h2>
          <p>
            Utilizamos apenas cookies essenciais para manter sua sessão de login e preferências.
            Não utilizamos cookies de rastreamento de terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">7. Segurança</h2>
          <p>
            Empregamos medidas técnicas e organizacionais para proteger seus dados, incluindo
            criptografia em trânsito (TLS), Row Level Security no banco de dados e autenticação segura.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">8. Contato do Encarregado (DPO)</h2>
          <p>
            Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de dados pessoais,
            entre em contato pelo email: <strong>privacidade@criativosai.com</strong>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground mb-2">9. Alterações</h2>
          <p>
            Esta política pode ser atualizada periodicamente. A data da última atualização está indicada no topo.
            Recomendamos revisar esta página regularmente.
          </p>
        </section>
      </div>
    </div>
  </div>
);

export default Privacidade;
