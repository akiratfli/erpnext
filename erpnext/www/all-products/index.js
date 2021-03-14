$(() => {
	class ProductListing {
		constructor() {
			this.bind_filters();
			this.bind_card_actions();
			this.bind_search();
			this.restore_filters_state();
		}

		bind_filters() {
			this.field_filters = {};
			this.attribute_filters = {};

			$('.product-filter').on('change', frappe.utils.debounce((e) => {
				const $checkbox = $(e.target);
				const is_checked = $checkbox.is(':checked');

				if ($checkbox.is('.attribute-filter')) {
					const {
						attributeName: attribute_name,
						attributeValue: attribute_value
					} = $checkbox.data();

					if (is_checked) {
						this.attribute_filters[attribute_name] = this.attribute_filters[attribute_name] || [];
						this.attribute_filters[attribute_name].push(attribute_value);
					} else {
						this.attribute_filters[attribute_name] = this.attribute_filters[attribute_name] || [];
						this.attribute_filters[attribute_name] = this.attribute_filters[attribute_name].filter(v => v !== attribute_value);
					}

					if (this.attribute_filters[attribute_name].length === 0) {
						delete this.attribute_filters[attribute_name];
					}
				} else if ($checkbox.is('.field-filter')) {
					const {
						filterName: filter_name,
						filterValue: filter_value
					} = $checkbox.data();

					if (is_checked) {
						this.field_filters[filter_name] = this.field_filters[filter_name] || [];
						this.field_filters[filter_name].push(filter_value);
					} else {
						this.field_filters[filter_name] = this.field_filters[filter_name] || [];
						this.field_filters[filter_name] = this.field_filters[filter_name].filter(v => v !== filter_value);
					}

					if (this.field_filters[filter_name].length === 0) {
						delete this.field_filters[filter_name];
					}
				}

				const query_string = get_query_string({
					field_filters: JSON.stringify(if_key_exists(this.field_filters)),
					attribute_filters: JSON.stringify(if_key_exists(this.attribute_filters)),
				});
				window.history.pushState('filters', '', `${location.pathname}?` + query_string);

				$('.page_content input').prop('disabled', true);
				this.get_items_with_filters()
					.then(html => {
						$('.products-list').html(html);
					})
					.then(data => {
						$('.page_content input').prop('disabled', false);
						return data;
					})
					.catch(() => {
						$('.page_content input').prop('disabled', false);
					});
			}, 1000));
		}

		bind_card_actions() {
			this.bind_add_to_cart_action();
			this.bind_wishlist_action();
		}

		bind_add_to_cart_action() {
			$('.page_content').on('click', '.btn-add-to-cart-list', (e) => {
				const $btn = $(e.currentTarget);
				$btn.prop('disabled', true);

				this.animate_add_to_cart($btn);

				const item_code = $btn.data('item-code');
				erpnext.shopping_cart.update_cart({
					item_code,
					qty: 1
				});

			});
		}

		animate_add_to_cart(button) {
			// Create 'added to cart' animation
			let btn_id = "#" + button[0].id;
			this.toggle_button_class(button, 'not-added', 'added-to-cart');
			$(btn_id).text('Added to Cart');

			// undo
			setTimeout(() => {
				this.toggle_button_class(button, 'added-to-cart', 'not-added');
				$(btn_id).text('Add to Cart');
			}, 2000);
		}

		bind_wishlist_action() {
			$('.page_content').on('click', '.like-action', (e) => {
				const $btn = $(e.currentTarget);
				const $wish_icon = $btn.find('.wish-icon');
				let me = this;

				if ($wish_icon.hasClass('wished')) {
					// un-wish item
					$btn.removeClass("like-animate");
					this.toggle_button_class($wish_icon, 'wished', 'not-wished');
					frappe.call({
						type: "POST",
						method: "erpnext.e_commerce.doctype.wishlist.wishlist.remove_from_wishlist",
						args: {
							item_code: $btn.data('item-code')
						},
						callback: function (r) {
							if (r.exc) {
								me.toggle_button_class($wish_icon, 'wished', 'not-wished');
								frappe.msgprint({
									message: __("Sorry, something went wrong. Please refresh."),
									indicator: "red",
									title: __("Note")}
								);
							} else {
								erpnext.e_commerce.set_wishlist_count();
							}
						}
					});
				} else {
					$btn.addClass("like-animate");
					this.toggle_button_class($wish_icon, 'not-wished', 'wished');
					frappe.call({
						type: "POST",
						method: "erpnext.e_commerce.doctype.wishlist.wishlist.add_to_wishlist",
						args: {
							item_code: $btn.data('item-code'),
							price: $btn.data('price')
						},
						callback: function (r) {
							if (r.exc) {
								me.toggle_button_class($wish_icon, 'wished', 'not-wished');
								frappe.msgprint({
									message: __("Sorry, something went wrong. Please refresh."),
									indicator: "red",
									title: __("Note")}
								);
							} else {
								erpnext.e_commerce.set_wishlist_count();
							}
						}
					});
				}
			});
		}

		toggle_button_class(button, remove, add) {
			button.removeClass(remove);
			button.addClass(add);
		}

		bind_search() {
			$('input[type=search]').on('keydown', (e) => {
				if (e.keyCode === 13) {
					// Enter
					const value = e.target.value;
					if (value) {
						window.location.search = 'search=' + e.target.value;
					} else {
						window.location.search = '';
					}
				}
			});
		}

		restore_filters_state() {
			const filters = frappe.utils.get_query_params();
			let {field_filters, attribute_filters} = filters;

			if (field_filters) {
				field_filters = JSON.parse(field_filters);
				for (let fieldname in field_filters) {
					const values = field_filters[fieldname];
					const selector = values.map(value => {
						return `input[data-filter-name="${fieldname}"][data-filter-value="${value}"]`;
					}).join(',');
					$(selector).prop('checked', true);
				}
				this.field_filters = field_filters;
			}
			if (attribute_filters) {
				attribute_filters = JSON.parse(attribute_filters);
				for (let attribute in attribute_filters) {
					const values = attribute_filters[attribute];
					const selector = values.map(value => {
						return `input[data-attribute-name="${attribute}"][data-attribute-value="${value}"]`;
					}).join(',');
					$(selector).prop('checked', true);
				}
				this.attribute_filters = attribute_filters;
			}
		}

		get_items_with_filters() {
			const { attribute_filters, field_filters } = this;
			const args = {
				field_filters: if_key_exists(field_filters),
				attribute_filters: if_key_exists(attribute_filters)
			};

			const item_group = $(".item-group-content").data('item-group');
			if (item_group) {
				Object.assign(field_filters, { item_group });
			}
			return new Promise((resolve, reject) => {
				frappe.call('erpnext.www.all-products.index.get_products_html_for_website', args)
					.then(r => {
						if (r.exc) reject(r.exc);
						else resolve(r.message);
					})
					.fail(reject);
			});
		}
	}

	new ProductListing();

	function get_query_string(object) {
		const url = new URLSearchParams();
		for (let key in object) {
			const value = object[key];
			if (value) {
				url.append(key, value);
			}
		}
		return url.toString();
	}

	function if_key_exists(obj) {
		let exists = false;
		for (let key in obj) {
			if (obj.hasOwnProperty(key) && obj[key]) {
				exists = true;
				break;
			}
		}
		return exists ? obj : undefined;
	}
});
