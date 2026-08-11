Yêu cầu người dùng: "{{message}}"
Ý định đã phân loại: {{intent}}
Mục tiêu plan: {{goal}}

Kế hoạch đã lập (bám theo, nhưng được điều chỉnh nếu trạng thái thực tế đã khác):
{{plan_steps}}

Vòng hiện tại: {{iteration}}/{{max_iterations}}

Trạng thái hiện tại:
- Số tài liệu đã tìm được: {{documents_count}}
- Số lần đã chạy tìm tài liệu: {{search_attempts}}
- Số kết quả web đã tìm được: {{web_results_count}}
- Số lần đã chạy web search: {{web_attempts}}
- Đã có bản nháp: {{has_artifact}}
- Trạng thái bản nháp: {{artifact_status}}
- Đã hỏi làm rõ: {{clarified}}

Ghi chú làm việc từ các bước trước:
{{working_notes}}

Tin nhắn gần đây trong chat:
{{recent_messages}}

Nếu người dùng vừa trả lời hoặc bổ sung ngữ cảnh cho câu hỏi làm rõ, KHÔNG được hỏi lại cùng nội dung đó. Hãy dùng câu trả lời đã có để tiếp tục search_documents, draft_artifact hoặc final_answer.
Nếu working_notes đã có kết quả web/tài liệu đủ để trả lời, KHÔNG tìm tiếp chỉ vì còn có thể tìm thêm.
Nếu working_notes cho thấy nguồn web bị lọc hoặc không đạt chuẩn, final_answer phải nêu giới hạn bằng chứng thay vì tự tạo kết luận chắc chắn.
Nếu đã có bản nháp nhưng trạng thái chưa verified, hãy chọn verify_artifact. Nếu trạng thái là needs_revision, hãy chọn revise_artifact. Chỉ chọn final_answer khi bản nháp đã verified hoặc yêu cầu không cần artifact.
Nếu yêu cầu có tính xoá/đổi kiến trúc/đổi connector/provider/API hoặc có nhiều mức triển khai hợp lý mà người dùng chưa xác nhận, hãy chọn ask_clarification trước.

Ưu tiên bước kế tiếp trong kế hoạch đã lập nếu bước đó chưa hoàn thành và vẫn còn phù hợp với trạng thái hiện tại; chỉ đi lệch khỏi kế hoạch khi trạng thái thực tế cho thấy bước đó không còn cần thiết.

Hãy chọn action tiếp theo.
