// 显示通知
export function showNotification(message: string, type: 'success' | 'error'): void {
  // 移除现有通知
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  // 创建新通知
  const notification = document.createElement('div');
  notification.className = `notification ${type === 'success' ? 'success' : 'error'}`;
  notification.textContent = message;
  notification.style.background = type === 'success' ? 'rgba(0, 255, 0, 0.9)' : 'rgba(255, 0, 0, 0.9)';
  
  document.body.appendChild(notification);
  
  // 显示通知
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  
  // 自动隐藏通知
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 3000);
}