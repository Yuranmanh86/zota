import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { appTheme } from '../theme/appTheme';

export function PoliciesScreen() {
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Text style={styles.title}>Termos de Uso e Política de Privacidade</Text>
          <Text style={styles.subtitle}>
            Página oficial da Zora para informações sobre o uso da plataforma e a proteção dos seus dados.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>1. Introdução</Text>
          <Text style={styles.paragraph}>
            Este documento reúne os Termos de Uso e a Política de Privacidade aplicáveis ao uso do aplicativo Zora e
            dos serviços digitais oferecidos pela plataforma. A Zora é uma plataforma financeira que combina gerenciamento de
            carteira, investimentos, poupança, participação comunitária, suporte com chat e autenticação segura.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>2. Aceitação dos Termos</Text>
          <Text style={styles.paragraph}>
            Ao acessar ou utilizar o aplicativo Zora, o usuário concorda com estes Termos de Uso e com a Política de
            Privacidade. Se o usuário não concordar com qualquer condição aqui prevista, deve interromper o uso do aplicativo.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>3. Definições</Text>
          <Text style={styles.itemText}>• Zora: o aplicativo e a plataforma digital da marca, incluindo mobile app, backend e serviços associados.</Text>
          <Text style={styles.itemText}>• Usuário: pessoa física que se cadastra ou utiliza os serviços dentro da plataforma Zora.</Text>
          <Text style={styles.itemText}>• Conta: o registro de usuário, com credenciais e perfil associado à Zora.</Text>
          <Text style={styles.itemText}>• Dados Pessoais: informações capazes de identificar o usuário, como nome, telefone, e-mail e identificadores de uso.</Text>
          <Text style={styles.itemText}>• Serviços: funcionalidades disponíveis no app Zora, como dashboard, carteira, investimentos, poupança, suporte e chat.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>4. Serviços da Zora</Text>
          <Text style={styles.itemText}>• Dashboard financeiro: visualização de saldo, lucros acumulados, saldo disponível e valor investido.</Text>
          <Text style={styles.itemText}>• Carteira pessoal: perfil do usuário, dados cadastrais, autenticação biométrica e gerenciamento de acesso.</Text>
          <Text style={styles.itemText}>• Investimentos: seleção de pacotes N1 a N9, visualização de rendimentos diários e compras de investimentos.</Text>
          <Text style={styles.itemText}>• Poupança: aplicação de valores em produtos de poupança com prazo curto, saldo bloqueado e liberação em até 72 horas.</Text>
          <Text style={styles.itemText}>• Participação comunitária: colaboração em grupos de contribuição e poupança compartilhada.</Text>
          <Text style={styles.itemText}>• Suporte e chat: canal de atendimento via chat interno, suporte com assistente e conversa com equipe Zora.</Text>
          <Text style={styles.itemText}>• Recarga e saque: operações de recarga (reload) e retirada de valores, quando disponíveis no fluxo.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>5. Uso Permitido e Conduta</Text>
          <Text style={styles.paragraph}>
            O usuário deve utilizar Zora de maneira responsável, legal e em conformidade com estes termos.
          </Text>
          <Text style={styles.paragraph}>É proibido ao usuário:</Text>
          <Text style={styles.itemText}>• acessar ou tentar acessar recursos, dados ou contas de terceiros;</Text>
          <Text style={styles.itemText}>• utilizar a Zora para atividades ilícitas, fraudulentas, lavagem de dinheiro ou financiamento de atividades irregulares;</Text>
          <Text style={styles.itemText}>• compartilhar login, senha, código de autenticação ou qualquer forma de acesso da conta com terceiros;</Text>
          <Text style={styles.itemText}>• alterar, descompilar, copiar ou reproduzir o software da Zora sem autorização;</Text>
          <Text style={styles.itemText}>• enviar conteúdo ofensivo, discriminatório ou que viole direitos de terceiros;</Text>
          <Text style={styles.itemText}>• manipular dados de uso, relatórios ou métricas do aplicativo.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>6. Cadastro e Segurança de Conta</Text>
          <Text style={styles.paragraph}>A Zora exige cadastro com dados verdadeiros para acesso ao aplicativo.</Text>
          <Text style={styles.itemText}>• nome completo;</Text>
          <Text style={styles.itemText}>• telefone;</Text>
          <Text style={styles.itemText}>• e-mail ou alias de e-mail para autenticação;</Text>
          <Text style={styles.itemText}>• senha de acesso.</Text>
          <Text style={styles.paragraph}>A plataforma suporta autenticação biométrica para facilitar o login seguro, desde que o dispositivo do usuário seja compatível e a opção seja ativada.</Text>
          <Text style={styles.itemText}>• manter a confidencialidade da senha e códigos de acesso;</Text>
          <Text style={styles.itemText}>• atualizar seus dados sempre que necessário;</Text>
          <Text style={styles.itemText}>• notificar a Zora em caso de perda, roubo ou uso indevido da conta.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>7. Propriedade Intelectual</Text>
          <Text style={styles.paragraph}>
            A Zora e seus parceiros detêm os direitos de propriedade intelectual sobre o software, design, interface, textos, imagens, ícones, marca e códigos.
          </Text>
          <Text style={styles.paragraph}>
            É vedada qualquer reprodução, distribuição, modificação ou uso não autorizado desses materiais.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>8. Responsabilidade e Isenção</Text>
          <Text style={styles.paragraph}>
            A Zora busca prestar seus serviços com segurança, disponibilidade e qualidade, mas não garante a operação contínua e ininterrupta do aplicativo.
          </Text>
          <Text style={styles.paragraph}>A plataforma não se responsabiliza por:</Text>
          <Text style={styles.itemText}>• perdas financeiras decorrentes de uso indevido ou falha de conexão;</Text>
          <Text style={styles.itemText}>• erros temporários de processamento;</Text>
          <Text style={styles.itemText}>• problemas causados por terceiros, redes ou serviços externos;</Text>
          <Text style={styles.itemText}>• decisões de investimento ou aplicação tomadas com base em informações do app.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>9. Privacidade e Tratamento de Dados</Text>
          <Text style={styles.paragraph}>A Zora coleta dados necessários para operar o aplicativo e prestar os serviços, como:</Text>
          <Text style={styles.itemText}>• dados de cadastro e perfil;</Text>
          <Text style={styles.itemText}>• dados de autenticação e sessão;</Text>
          <Text style={styles.itemText}>• registros de transações, investimentos e aplicações;</Text>
          <Text style={styles.itemText}>• dados de uso e interação com o app;</Text>
          <Text style={styles.itemText}>• informações de dispositivos e acesso.</Text>
          <Text style={styles.paragraph}>Os dados coletados são usados para:</Text>
          <Text style={styles.itemText}>• permitir acesso à conta e autenticação;</Text>
          <Text style={styles.itemText}>• processar investimentos, poupança e contribuições comunitárias;</Text>
          <Text style={styles.itemText}>• exibir saldo, histórico e relatórios no dashboard;</Text>
          <Text style={styles.itemText}>• facilitar comunicação com o suporte;</Text>
          <Text style={styles.itemText}>• proteger a conta contra fraudes;</Text>
          <Text style={styles.itemText}>• cumprir obrigações legais e regulatórias.</Text>
          <Text style={styles.paragraph}>A Zora pode compartilhar dados com:</Text>
          <Text style={styles.itemText}>• provedores de serviços necessários à operação do aplicativo;</Text>
          <Text style={styles.itemText}>• parceiros responsáveis pelo processamento de pagamentos, recargas e transferências;</Text>
          <Text style={styles.itemText}>• autoridades competentes quando exigido por lei;</Text>
          <Text style={styles.itemText}>• fornecedores de análise e desempenho autorizados.</Text>
          <Text style={styles.paragraph}>A Zora adota medidas técnicas e administrativas para proteger as informações do usuário, incluindo criptografia, controle de acesso e monitoramento contínuo.</Text>
          <Text style={styles.paragraph}>Os dados são conservados pelo período necessário para atender às finalidades descritas e em conformidade com requisitos legais.</Text>
          <Text style={styles.paragraph}>O usuário tem os seguintes direitos sobre seus dados pessoais:</Text>
          <Text style={styles.itemText}>• acessar e obter confirmação sobre o tratamento;</Text>
          <Text style={styles.itemText}>• corrigir dados incompletos, inexatos ou desatualizados;</Text>
          <Text style={styles.itemText}>• solicitar a exclusão de dados, quando aplicável;</Text>
          <Text style={styles.itemText}>• revogar consentimento, quando admitido por lei;</Text>
          <Text style={styles.itemText}>• obter informações sobre compartilhamento e finalidade do tratamento.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>10. Tecnologias Locais e de Rastreamento</Text>
          <Text style={styles.paragraph}>A Zora pode utilizar cookies, identificadores locais, armazenamento do dispositivo e outras tecnologias similares para melhorar a experiência, controlar sessões e realizar análise de uso.</Text>
          <Text style={styles.paragraph}>A gestão dessas ferramentas pode ser feita pelo navegador, configurações do dispositivo ou recursos disponíveis na própria plataforma.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>11. Comunicação e Notificações</Text>
          <Text style={styles.paragraph}>A Zora pode enviar ao usuário mensagens de notificações operacionais, alertas de segurança, atualizações de serviços e mensagens de suporte via chat.</Text>
          <Text style={styles.paragraph}>O usuário também poderá receber informações e comunicações dentro do aplicativo, desde que autorizado ou em razão de relacionamento estabelecido.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>12. Atualizações do Documento</Text>
          <Text style={styles.paragraph}>A Zora reserva-se o direito de atualizar estes Termos de Uso e a Política de Privacidade sempre que necessário. As alterações serão comunicadas na plataforma e passarão a vigorar a partir da data de publicação.</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>13. Contato</Text>
          <Text style={styles.paragraph}>Para dúvidas, suporte ou solicitações relacionadas a estes termos ou à privacidade, o usuário deve utilizar os canais oficiais disponíveis no aplicativo Zora.</Text>
        </View>

        <View style={styles.sectionCard}>  
          <Text style={styles.sectionTitle}>14. Disposições Gerais</Text>
          <Text style={styles.paragraph}>Estes Termos de Uso e a Política de Privacidade são regidos pela legislação brasileira aplicável. Em caso de controvérsia, as partes elegem o foro competente conforme a legislação vigente, sem prejuízo das normas de arbitragem ou de proteção ao consumidor aplicáveis.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFF7ED',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  headerCard: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 24,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 106, 43, 0.12)',
    shadowColor: '#FF7A00',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FF6A2B',
    fontFamily: appTheme.fontFamily,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    fontFamily: appTheme.fontFamily,
  },
  sectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 106, 43, 0.08)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
    fontFamily: appTheme.fontFamily,
  },
  paragraph: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
    fontFamily: appTheme.fontFamily,
    marginBottom: 10,
  },
  itemText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
    marginBottom: 8,
    fontFamily: appTheme.fontFamily,
  },
});
