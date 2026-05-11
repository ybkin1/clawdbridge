import { useModelStore } from '../stores/use-model-store';
import { getWsConnection } from './ws-connection';

export class ModelRouter {
  private currentRoute: 'cloud' | 'deepseek' | 'auto' = 'auto';
  private cloudAgentOnline = false;
  private wasDegraded = false;

  async route(message: string, intent: string): Promise<'cloud' | 'deepseek'> {
    if (this.currentRoute !== 'auto') return this.currentRoute;
    if (intent === 'coding' && this.cloudAgentOnline) return 'cloud';
    if (this.cloudAgentOnline) return 'cloud';
    return 'deepseek';
  }

  detectIntent(message: string): 'coding' | 'chat' | 'review' | 'unknown' {
    const codingKeywords = /\b(修|改|写|build|fix|add|remove|refactor|deploy|bug|错误|编译|运行|测试|test|实现|添加|删除|重构)\b/;
    const reviewKeywords = /review|检查|审计|看看|分析|audit/i;
    if (codingKeywords.test(message)) return 'coding';
    if (reviewKeywords.test(message)) return 'review';
    return 'chat';
  }

  onCloudAgentStatusChange(online: boolean): void {
    this.cloudAgentOnline = online;
    useModelStore.getState().setCloudAgentOnline(online);
    if (online && this.wasDegraded && this.currentRoute === 'auto') {
      this.wasDegraded = false;
      useModelStore.getState().setActiveModel('Kimi kimi2.6 (Cloud)');
    }
    if (!online) this.wasDegraded = true;
  }

  setRoute(route: 'cloud' | 'deepseek' | 'auto'): void {
    this.currentRoute = route;
    useModelStore.getState().setActiveModel(route === 'cloud' ? 'Kimi kimi2.6 (Cloud)' : 'DeepSeek V3');
  }

  getActiveRoute(): string { return this.currentRoute; }
}

export const modelRouter = new ModelRouter();
