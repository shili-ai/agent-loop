Yêu cầu người dùng: "{{message}}"
Ý định đã phân loại: {{intent}}
Mục tiêu plan: {{goal}}
Vòng hiện tại: {{iteration}}/{{max_iterations}}

Trạng thái hiện tại:
- Số tài liệu đã tìm được: {{documents_count}}
- Số lần đã chạy tìm tài liệu: {{search_attempts}}
- Số kết quả web đã tìm được: {{web_results_count}}
- Số lần đã chạy web search: {{web_attempts}}
- Đã có bản nháp: {{has_artifact}}
- Đã hỏi làm rõ: {{clarified}}

Ghi chú làm việc từ các bước trước:
{{working_notes}}

Tin nhắn gần đây trong chat:
{{recent_messages}}

Nếu người dùng vừa trả lời hoặc bổ sung ngữ cảnh cho câu hỏi làm rõ, KHÔNG được hỏi lại cùng nội dung đó. Hãy dùng câu trả lời đã có để tiếp tục search_documents, draft_artifact hoặc final_answer.
Nếu working_notes đã có kết quả web/tài liệu đủ để trả lời, KHÔNG tìm tiếp chỉ vì còn có thể tìm thêm.
Nếu working_notes cho thấy nguồn web bị lọc hoặc không đạt chuẩn, final_answer phải nêu giới hạn bằng chứng thay vì tự tạo kết luận chắc chắn.

Hãy chọn action tiếp theo.
